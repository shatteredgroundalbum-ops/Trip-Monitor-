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
ALLOWED_ROLES = {"company_driver", "owner_operator", "lto"}


class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: Optional[str] = None
    role: Optional[str] = None  # company_driver | owner_operator | lto


class DriverProfile(BaseModel):
    user_id: Optional[str] = None
    full_name: str = Field(min_length=1, max_length=120)
    # Legacy / RTI-specific fields — kept optional for backward compat
    home_terminal: Optional[str] = Field(default=None, max_length=120)
    time_zone: Optional[str] = Field(default="America/Chicago", max_length=80)
    driver_id: Optional[str] = Field(default=None, max_length=40)
    # Driver type — accepts new + legacy values
    truck_assignment_type: Optional[str] = None  # "Permanent" or "Slip Seat" (legacy "Slip-Seating" also accepted)
    # Personal info (new spec)
    address: Optional[str] = Field(default=None, max_length=200)
    city: Optional[str] = Field(default=None, max_length=80)
    state: Optional[str] = Field(default=None, max_length=40)
    zip_code: Optional[str] = Field(default=None, max_length=15)
    phone: Optional[str] = Field(default=None, max_length=40)
    # Vehicle (new spec)
    company_id: Optional[str] = Field(default=None, max_length=80)
    truck_make: Optional[str] = Field(default=None, max_length=80)
    truck_color: Optional[str] = Field(default=None, max_length=40)
    truck_color_other: Optional[str] = Field(default=None, max_length=40)
    truck_number: Optional[str] = Field(default=None, max_length=40)
    license_plate: Optional[str] = Field(default=None, max_length=40)
    # Experience (new spec)
    years_experience: Optional[int] = Field(default=None, ge=0, le=80)
    lifetime_miles: Optional[int] = Field(default=None, ge=0, le=20_000_000)
    # Existing legacy
    home_address: Optional[str] = Field(default=None, max_length=200)
    dispatcher_email: Optional[EmailStr] = None


class RoleUpdate(BaseModel):
    role: str


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
    total_trip_miles: Optional[int] = None  # required at finish
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


@api_router.post("/auth/role")
async def set_user_role(payload: RoleUpdate, user: User = Depends(get_current_user)):
    role = (payload.role or "").strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {sorted(ALLOWED_ROLES)}")
    await db.users.update_one({"user_id": user.user_id}, {"$set": {"role": role}})
    return {"user_id": user.user_id, "role": role}


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
    # Normalize driver-type aliases
    norm = {"Slip-Seating": "Slip Seat", "Slip Seating": "Slip Seat", "Permanent Driver": "Permanent"}
    if profile.truck_assignment_type:
        profile.truck_assignment_type = norm.get(profile.truck_assignment_type, profile.truck_assignment_type)
    if profile.truck_assignment_type and profile.truck_assignment_type not in ("Permanent", "Slip Seat"):
        raise HTTPException(status_code=422, detail="truck_assignment_type must be 'Permanent' or 'Slip Seat'")

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
    allowed = {"rows", "road_expenses", "notes", "order_number", "bol_number", "truck_number", "total_trip_miles"}
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
    miles = existing.get("total_trip_miles")
    try:
        miles_int = int(miles) if miles not in (None, "") else 0
    except (TypeError, ValueError):
        miles_int = 0
    if miles_int <= 0:
        raise HTTPException(
            status_code=422,
            detail="total_trip_miles is required (round-trip miles) before a trip can be finished",
        )
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


@api_router.get("/stats")
async def get_stats(user: User = Depends(get_current_user)):
    """Aggregate driver stats for the dashboard tiles."""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    finished_total = await db.trip_sessions.count_documents(
        {"user_id": user.user_id, "status": "finished"}
    )
    finished_month = await db.trip_sessions.count_documents(
        {"user_id": user.user_id, "status": "finished", "finished_at": {"$gte": month_start}}
    )

    # Total stops across all finished trips
    total_stops_pipeline = [
        {"$match": {"user_id": user.user_id, "status": "finished"}},
        {"$unwind": "$rows"},
        {"$match": {"$or": [
            {"rows.event_code": {"$nin": [None, ""]}},
            {"rows.location_name": {"$nin": [None, ""]}},
            {"rows.stop_city": {"$nin": [None, ""]}},
        ]}},
        {"$count": "n"},
    ]
    cursor = db.trip_sessions.aggregate(total_stops_pipeline)
    total_stops = 0
    async for doc in cursor:
        total_stops = doc.get("n", 0)

    # Miles aggregation (sum of total_trip_miles on finished trips)
    miles_pipeline_total = [
        {"$match": {"user_id": user.user_id, "status": "finished"}},
        {"$group": {"_id": None, "miles": {"$sum": {"$ifNull": ["$total_trip_miles", 0]}}}},
    ]
    miles_total_in_app = 0
    async for doc in db.trip_sessions.aggregate(miles_pipeline_total):
        miles_total_in_app = int(doc.get("miles") or 0)

    miles_pipeline_today = [
        {"$match": {"user_id": user.user_id, "status": "finished", "finished_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "miles": {"$sum": {"$ifNull": ["$total_trip_miles", 0]}}}},
    ]
    miles_today = 0
    async for doc in db.trip_sessions.aggregate(miles_pipeline_today):
        miles_today = int(doc.get("miles") or 0)

    # Most-used location across all rows
    top_loc_pipeline = [
        {"$match": {"user_id": user.user_id}},
        {"$unwind": "$rows"},
        {"$match": {"rows.location_name": {"$nin": [None, ""]}}},
        {"$group": {"_id": "$rows.location_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 1},
    ]
    cursor = db.trip_sessions.aggregate(top_loc_pipeline)
    top_location = None
    async for doc in cursor:
        top_location = doc.get("_id")

    # Last finished trip
    last_finished = await db.trip_sessions.find_one(
        {"user_id": user.user_id, "status": "finished"},
        {"_id": 0},
        sort=[("finished_at", -1)],
    )

    # Profile baseline miles
    profile_doc = await db.driver_profiles.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
    baseline_miles = int(profile_doc.get("lifetime_miles") or 0)

    return {
        "trips_total": finished_total,
        "trips_this_month": finished_month,
        "total_stops": total_stops,
        "top_location": top_location,
        "last_trip": last_finished,
        "miles_today": miles_today,
        "miles_in_app": miles_total_in_app,
        "miles_lifetime": baseline_miles + miles_total_in_app,
    }


@api_router.get("/stats/week")
async def get_weekly_stats(user: User = Depends(get_current_user)):
    """Last-7-days bar chart data: one bucket per local day,
    each with miles + finished trip count.

    Days are bucketed by the user's profile time_zone (falls back to UTC).
    Returns 7 entries oldest → newest (today is last).
    """
    profile_doc = await db.driver_profiles.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
    tz_name = profile_doc.get("time_zone") or "UTC"
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = timezone.utc

    now_local = datetime.now(tz)
    today_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    # Window: 7 days starting at midnight 6 days ago (local)
    window_start_local = today_local - timedelta(days=6)
    window_start_utc_iso = window_start_local.astimezone(timezone.utc).isoformat()

    finished = await db.trip_sessions.find(
        {
            "user_id": user.user_id,
            "status": "finished",
            "finished_at": {"$gte": window_start_utc_iso},
        },
        {"_id": 0, "finished_at": 1, "total_trip_miles": 1, "session_id": 1},
    ).to_list(1000)

    # Pre-create 7 buckets keyed by YYYY-MM-DD (local)
    buckets = {}
    for i in range(7):
        day = window_start_local + timedelta(days=i)
        buckets[day.strftime("%Y-%m-%d")] = {
            "date": day.strftime("%Y-%m-%d"),
            "label": day.strftime("%a"),  # Mon/Tue/...
            "is_today": day.date() == today_local.date(),
            "miles": 0,
            "trips": 0,
        }

    for trip in finished:
        finished_at = trip.get("finished_at")
        if not finished_at:
            continue
        try:
            dt_utc = datetime.fromisoformat(finished_at)
            if dt_utc.tzinfo is None:
                dt_utc = dt_utc.replace(tzinfo=timezone.utc)
            dt_local = dt_utc.astimezone(tz)
            key = dt_local.strftime("%Y-%m-%d")
        except (TypeError, ValueError):
            continue
        if key in buckets:
            buckets[key]["miles"] += int(trip.get("total_trip_miles") or 0)
            buckets[key]["trips"] += 1

    days = list(buckets.values())
    miles_total = sum(d["miles"] for d in days)
    trips_total = sum(d["trips"] for d in days)
    miles_max = max((d["miles"] for d in days), default=0)
    return {
        "time_zone": tz_name,
        "miles_total_7d": miles_total,
        "trips_total_7d": trips_total,
        "miles_max": miles_max,
        "days": days,
    }


# ============ ACHIEVEMENTS ============
MILES_TIERS = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 3_000_000, 5_000_000]
YEARS_TIERS = [1, 5, 10, 15, 20, 25, 30]
TRIPS_TIERS = [10, 50, 100, 250, 500, 1000]


def _miles_label(n: int) -> str:
    if n >= 1_000_000:
        whole = n // 1_000_000
        return f"{whole}M Miles"
    return f"{n // 1000}K Miles"


@api_router.get("/achievements")
async def get_achievements(user: User = Depends(get_current_user)):
    """Compute earned + locked badges from profile baseline + finished trips."""
    profile_doc = await db.driver_profiles.find_one({"user_id": user.user_id}, {"_id": 0}) or {}
    years = int(profile_doc.get("years_experience") or 0)
    baseline = int(profile_doc.get("lifetime_miles") or 0)
    finished_total = await db.trip_sessions.count_documents(
        {"user_id": user.user_id, "status": "finished"}
    )
    miles_in_app = 0
    async for doc in db.trip_sessions.aggregate([
        {"$match": {"user_id": user.user_id, "status": "finished"}},
        {"$group": {"_id": None, "miles": {"$sum": {"$ifNull": ["$total_trip_miles", 0]}}}},
    ]):
        miles_in_app = int(doc.get("miles") or 0)
    total_miles = baseline + miles_in_app

    badges = []
    for tier in MILES_TIERS:
        badges.append({
            "id": f"miles_{tier}",
            "category": "miles",
            "label": _miles_label(tier),
            "threshold": tier,
            "progress": min(total_miles, tier),
            "earned": total_miles >= tier,
        })
    for tier in YEARS_TIERS:
        badges.append({
            "id": f"years_{tier}",
            "category": "years",
            "label": f"{tier} Year{'s' if tier != 1 else ''} of Service",
            "threshold": tier,
            "progress": min(years, tier),
            "earned": years >= tier,
        })
    for tier in TRIPS_TIERS:
        badges.append({
            "id": f"trips_{tier}",
            "category": "trips",
            "label": f"{tier} Trips",
            "threshold": tier,
            "progress": min(finished_total, tier),
            "earned": finished_total >= tier,
        })

    earned_count = sum(1 for b in badges if b["earned"])
    return {
        "years_experience": years,
        "lifetime_miles": total_miles,
        "trips_total": finished_total,
        "earned_count": earned_count,
        "total_count": len(badges),
        "badges": badges,
    }


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
