from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import asyncio
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import resend

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
SENDER_EMAIL = os.environ.get('SENDER_EMAIL', 'onboarding@resend.dev')
if RESEND_API_KEY:
    resend.api_key = RESEND_API_KEY

app = FastAPI()
api_router = APIRouter(prefix="/api")

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


# ============ MODELS ============
class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None


class DriverProfile(BaseModel):
    user_id: Optional[str] = None
    full_name: str = Field(min_length=1, max_length=120)
    home_terminal: str = Field(min_length=1, max_length=120)
    time_zone: str = Field(min_length=1, max_length=80)
    driver_id: str = Field(min_length=1, max_length=40)
    truck_assignment_type: str  # "Permanent" or "Slip Seat"
    truck_number: Optional[str] = Field(default=None, max_length=40)
    license_plate: Optional[str] = Field(default=None, max_length=40)
    home_address: Optional[str] = Field(default=None, max_length=200)
    dispatcher_email: Optional[EmailStr] = None


class TripRow(BaseModel):
    seq: int
    event_code: Optional[str] = None
    departure_date: Optional[str] = None
    departure_time: Optional[str] = None
    location_name: Optional[str] = None
    stop_city: Optional[str] = None
    stop_state: Optional[str] = None
    trailer_number: Optional[str] = None
    trailer_type: Optional[str] = None
    trailer_type_custom: Optional[str] = None
    temperature: Optional[int] = None


class RoadExpense(BaseModel):
    date: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[str] = None


class TripSession(BaseModel):
    session_id: str
    user_id: str
    status: str = "active"  # active | finished
    session_type: str  # Previous | New | Future
    load_type: str  # Store | Warehouse-Dairy | Warehouse-Water
    has_temperature: bool
    driver_id: str
    truck_number: Optional[str] = None
    order_number: str
    bol_number: str
    rows: List[TripRow]
    road_expenses: List[RoadExpense]
    notes: str = ""
    created_at: str
    updated_at: str
    finished_at: Optional[str] = None


# ============ AUTH ============
async def get_current_user(request: Request) -> User:
    session_token = request.cookies.get("session_token")
    if not session_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            session_token = auth_header[7:]
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session_doc = await db.user_sessions.find_one({"session_token": session_token}, {"_id": 0})
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")

    expires_at = session_doc["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")

    user_doc = await db.users.find_one({"user_id": session_doc["user_id"]}, {"_id": 0})
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    return User(**user_doc)


@api_router.post("/auth/session")
async def process_session(request: Request, response: Response):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    async with httpx.AsyncClient(timeout=15.0) as http_client:
        r = await http_client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id})
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid session_id")
        data = r.json()

    email = data["email"]
    name = data["name"]
    picture = data.get("picture", "")
    session_token = data["session_token"]

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "created_at": datetime.now(timezone.utc).isoformat()
        })

    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    response.set_cookie(
        key="session_token", value=session_token,
        httponly=True, secure=True, samesite="none",
        path="/", max_age=7 * 24 * 60 * 60,
    )
    return {"user_id": user_id, "email": email, "name": name, "picture": picture}


@api_router.get("/auth/me")
async def auth_me(user: User = Depends(get_current_user)):
    return user.model_dump()


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    response.delete_cookie("session_token", path="/", samesite="none", secure=True)
    return {"ok": True}


# ============ DRIVER PROFILE ============
@api_router.get("/profile")
async def get_profile(user: User = Depends(get_current_user)):
    doc = await db.driver_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    return doc  # may be null


@api_router.post("/profile")
async def save_profile(profile: DriverProfile, user: User = Depends(get_current_user)):
    if profile.truck_assignment_type not in ("Permanent", "Slip Seat"):
        raise HTTPException(status_code=422, detail="truck_assignment_type must be 'Permanent' or 'Slip Seat'")
    if profile.truck_assignment_type == "Permanent" and not (profile.truck_number or "").strip():
        raise HTTPException(status_code=422, detail="truck_number is required for Permanent assignment")

    data = profile.model_dump(exclude_none=False)
    data["user_id"] = user.user_id  # always owner
    await db.driver_profiles.update_one(
        {"user_id": user.user_id}, {"$set": data}, upsert=True
    )
    doc = await db.driver_profiles.find_one({"user_id": user.user_id}, {"_id": 0})
    return doc


# ============ TRIP SESSIONS ============
@api_router.get("/trip-sessions/active")
async def get_active_session(user: User = Depends(get_current_user)):
    doc = await db.trip_sessions.find_one(
        {"user_id": user.user_id, "status": "active"}, {"_id": 0}
    )
    return doc


@api_router.get("/trip-sessions")
async def list_sessions(user: User = Depends(get_current_user)):
    docs = await db.trip_sessions.find(
        {"user_id": user.user_id}, {"_id": 0}
    ).sort("created_at", -1).limit(100).to_list(100)
    return docs


@api_router.get("/trip-sessions/{session_id}")
async def get_session(session_id: str, user: User = Depends(get_current_user)):
    doc = await db.trip_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc


@api_router.post("/trip-sessions")
async def create_session(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    # close any existing active
    await db.trip_sessions.update_many(
        {"user_id": user.user_id, "status": "active"},
        {"$set": {"status": "abandoned", "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    now = datetime.now(timezone.utc).isoformat()
    session_id = f"ts_{uuid.uuid4().hex[:12]}"
    rows = payload.get("rows") or [{"seq": i + 1} for i in range(8)]
    doc = {
        "session_id": session_id,
        "user_id": user.user_id,
        "status": "active",
        "session_type": payload.get("session_type", "New"),
        "load_type": payload.get("load_type", "Store"),
        "has_temperature": bool(payload.get("has_temperature", True)),
        "driver_id": payload.get("driver_id", ""),
        "truck_number": payload.get("truck_number", ""),
        "order_number": payload.get("order_number", ""),
        "bol_number": payload.get("bol_number", ""),
        "rows": rows,
        "road_expenses": payload.get("road_expenses") or [{} for _ in range(5)],
        "notes": payload.get("notes", ""),
        "created_at": now,
        "updated_at": now,
        "finished_at": None,
    }
    await db.trip_sessions.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.put("/trip-sessions/{session_id}")
async def update_session(session_id: str, payload: Dict[str, Any], user: User = Depends(get_current_user)):
    existing = await db.trip_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if existing.get("status") == "finished":
        raise HTTPException(status_code=409, detail="Session already finished")

    # Whitelist allowed fields
    allowed = {"rows", "road_expenses", "notes", "order_number", "bol_number", "truck_number"}
    update_doc = {k: v for k, v in payload.items() if k in allowed}
    # Allow status only when transitioning to "abandoned"
    if payload.get("status") == "abandoned":
        update_doc["status"] = "abandoned"
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.trip_sessions.update_one(
        {"session_id": session_id, "user_id": user.user_id},
        {"$set": update_doc}
    )
    doc = await db.trip_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    return doc


@api_router.post("/trip-sessions/{session_id}/finish")
async def finish_session(session_id: str, user: User = Depends(get_current_user)):
    existing = await db.trip_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if existing.get("status") == "finished":
        raise HTTPException(status_code=409, detail="Session already finished")
    now = datetime.now(timezone.utc).isoformat()
    await db.trip_sessions.update_one(
        {"session_id": session_id, "user_id": user.user_id},
        {"$set": {"status": "finished", "finished_at": now, "updated_at": now}},
    )
    doc = await db.trip_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    return doc


@api_router.post("/trip-sessions/{session_id}/reopen")
async def reopen_session(session_id: str, user: User = Depends(get_current_user)):
    """Re-open a finished session for editing. Closes any other active session first."""
    existing = await db.trip_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Not found")
    if existing.get("status") == "active":
        return existing  # already active
    now = datetime.now(timezone.utc).isoformat()
    # Abandon any other active session
    await db.trip_sessions.update_many(
        {"user_id": user.user_id, "status": "active", "session_id": {"$ne": session_id}},
        {"$set": {"status": "abandoned", "updated_at": now}},
    )
    await db.trip_sessions.update_one(
        {"session_id": session_id, "user_id": user.user_id},
        {"$set": {"status": "active", "finished_at": None, "updated_at": now}},
    )
    doc = await db.trip_sessions.find_one(
        {"session_id": session_id, "user_id": user.user_id}, {"_id": 0}
    )
    return doc


# ============ LEARNING: LOCATIONS, TRAILERS, CITIES ============
@api_router.get("/locations")
async def list_locations(user: User = Depends(get_current_user)):
    docs = await db.locations.find(
        {"user_id": user.user_id}, {"_id": 0}
    ).sort("count", -1).limit(500).to_list(500)
    return docs


@api_router.post("/locations/bump")
async def bump_location(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    name = (payload.get("name") or "").strip()
    if not name:
        return {"ok": True}
    await db.locations.update_one(
        {"user_id": user.user_id, "name": name},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/trailers")
async def list_trailers(user: User = Depends(get_current_user)):
    docs = await db.trailers.find(
        {"user_id": user.user_id}, {"_id": 0}
    ).sort("count", -1).limit(500).to_list(500)
    return docs


@api_router.post("/trailers/bump")
async def bump_trailer(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    number = (payload.get("number") or "").strip()
    if not number:
        return {"ok": True}
    await db.trailers.update_one(
        {"user_id": user.user_id, "number": number},
        {"$inc": {"count": 1}, "$set": {"type": payload.get("type"), "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/cities")
async def list_cities(user: User = Depends(get_current_user)):
    docs = await db.cities.find(
        {"user_id": user.user_id}, {"_id": 0}
    ).sort("count", -1).limit(1000).to_list(1000)
    return docs


@api_router.post("/cities/bump")
async def bump_city(payload: Dict[str, Any], user: User = Depends(get_current_user)):
    city = (payload.get("city") or "").strip()
    state = (payload.get("state") or "").strip().upper()
    if not city or not state:
        return {"ok": True}
    await db.cities.update_one(
        {"user_id": user.user_id, "city": city, "state": state},
        {"$inc": {"count": 1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True}


@api_router.get("/")
async def root():
    return {"app": "Trip Monitor Driver Edition", "status": "ok"}


# ============ EMAIL (Resend) ============
class EmailAttachment(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    content_b64: str = Field(min_length=1)  # base64-encoded file bytes
    content_type: str = Field(default="application/octet-stream", max_length=100)


class SendTripEmailRequest(BaseModel):
    recipient: EmailStr
    subject: str = Field(min_length=1, max_length=300)
    html_body: str = Field(min_length=1, max_length=50000)
    attachments: List[EmailAttachment] = Field(default_factory=list, max_length=4)


@api_router.post("/email/send-trip-sheet")
async def send_trip_sheet_email(
    payload: SendTripEmailRequest,
    user: User = Depends(get_current_user),
):
    if not RESEND_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Email provider not configured. Set RESEND_API_KEY in backend env.",
        )

    params = {
        "from": SENDER_EMAIL,
        "to": [payload.recipient],
        "subject": payload.subject,
        "html": payload.html_body,
    }
    if payload.attachments:
        params["attachments"] = [
            {
                "filename": a.filename,
                "content": a.content_b64,
                "content_type": a.content_type,
            }
            for a in payload.attachments
        ]

    try:
        result = await asyncio.to_thread(resend.Emails.send, params)
        email_id = result.get("id") if isinstance(result, dict) else None
        return {"status": "success", "email_id": email_id, "recipient": payload.recipient}
    except Exception as e:  # noqa: BLE001
        logger.error(f"Resend send failed: {e}")
        raise HTTPException(status_code=502, detail=f"Email send failed: {e}")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
