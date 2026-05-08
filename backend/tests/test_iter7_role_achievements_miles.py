"""Iter 7 backend tests:
   - POST /api/auth/role validation
   - POST /api/profile new fields + legacy alias
   - Trip session finish miles guard
   - GET /api/stats miles fields
   - GET /api/achievements badges
"""
import os
import time
import pytest
import requests
from pymongo import MongoClient
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/')
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')


@pytest.fixture(scope="module")
def auth():
    """Inject a fresh test user + session directly into Mongo."""
    mc = MongoClient(MONGO_URL)
    db = mc[DB_NAME]
    suffix = str(int(time.time() * 1000))
    user_id = f"tm_iter7_pyt_{suffix}"
    token = f"tm_iter7_pyt_session_{suffix}"
    db.users.insert_one({
        "user_id": user_id,
        "email": f"iter7.pyt+{suffix}@rti.test",
        "name": "Iter7 Pytest",
        "picture": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    yield {"user_id": user_id, "token": token, "db": db}
    # cleanup
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_one({"session_token": token})
    db.driver_profiles.delete_one({"user_id": user_id})
    db.trip_sessions.delete_many({"user_id": user_id})


@pytest.fixture
def client(auth):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"})
    return s


# -------- /api/auth/role --------
class TestAuthRole:
    def test_unauth_rejected(self):
        r = requests.post(f"{BASE_URL}/api/auth/role", json={"role": "lto"})
        assert r.status_code == 401

    @pytest.mark.parametrize("role", ["company_driver", "owner_operator", "lto"])
    def test_valid_roles_accepted(self, client, auth, role):
        r = client.post(f"{BASE_URL}/api/auth/role", json={"role": role})
        assert r.status_code == 200, r.text
        assert r.json()["role"] == role
        u = auth["db"].users.find_one({"user_id": auth["user_id"]})
        assert u["role"] == role

    @pytest.mark.parametrize("bad", ["DRIVER", "admin", "", "  ", "null"])
    def test_invalid_role_422(self, client, bad):
        r = client.post(f"{BASE_URL}/api/auth/role", json={"role": bad})
        assert r.status_code == 422, r.text

    def test_missing_role_field_422(self, client):
        r = client.post(f"{BASE_URL}/api/auth/role", json={})
        assert r.status_code == 422


# -------- /api/profile --------
class TestProfileNewShape:
    def test_full_new_shape_persists(self, client, auth):
        payload = {
            "full_name": "Iter Seven Driver",
            "address": "100 Main St", "city": "Dallas", "state": "TX", "zip_code": "75001",
            "phone": "555-0123",
            "truck_assignment_type": "Permanent",
            "company_id": "RTI-12345",
            "truck_make": "Peterbilt", "truck_color": "Blue",
            "truck_number": "T-7", "license_plate": "ABC123",
            "years_experience": 12, "lifetime_miles": 850_000,
        }
        r = client.post(f"{BASE_URL}/api/profile", json=payload)
        assert r.status_code == 200, r.text
        d = r.json()
        for k, v in payload.items():
            assert d.get(k) == v, f"{k}: expected {v}, got {d.get(k)}"
        # Verify GET persistence
        g = client.get(f"{BASE_URL}/api/profile")
        assert g.status_code == 200
        gd = g.json()
        assert gd["years_experience"] == 12
        assert gd["lifetime_miles"] == 850_000
        assert gd["truck_make"] == "Peterbilt"

    def test_legacy_alias_slip_seating(self, client):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Slip Test",
            "truck_assignment_type": "Slip-Seating",
        })
        assert r.status_code == 200
        assert r.json()["truck_assignment_type"] == "Slip Seat"

    def test_negative_years_rejected(self, client):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Neg Test", "years_experience": -1,
        })
        assert r.status_code == 422

    def test_negative_lifetime_miles_rejected(self, client):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Neg Test", "lifetime_miles": -5,
        })
        assert r.status_code == 422


# -------- Trip session miles guard --------
class TestTripFinishMilesGuard:
    @pytest.fixture
    def session_id(self, client, auth):
        # close any existing
        auth["db"].trip_sessions.update_many(
            {"user_id": auth["user_id"], "status": "active"},
            {"$set": {"status": "abandoned"}}
        )
        r = client.post(f"{BASE_URL}/api/trip-sessions", json={
            "session_type": "New", "load_type": "Store", "has_temperature": True,
            "driver_id": "D1", "order_number": "ON1", "bol_number": "BOL1",
        })
        assert r.status_code == 200
        return r.json()["session_id"]

    def test_finish_without_miles_422(self, client, session_id):
        r = client.post(f"{BASE_URL}/api/trip-sessions/{session_id}/finish")
        assert r.status_code == 422
        assert "total_trip_miles" in r.text.lower()

    def test_finish_with_zero_miles_422(self, client, session_id):
        client.put(f"{BASE_URL}/api/trip-sessions/{session_id}", json={"total_trip_miles": 0})
        r = client.post(f"{BASE_URL}/api/trip-sessions/{session_id}/finish")
        assert r.status_code == 422

    def test_finish_with_positive_miles_200(self, client, session_id):
        u = client.put(f"{BASE_URL}/api/trip-sessions/{session_id}", json={"total_trip_miles": 542})
        assert u.status_code == 200
        assert u.json()["total_trip_miles"] == 542
        r = client.post(f"{BASE_URL}/api/trip-sessions/{session_id}/finish")
        assert r.status_code == 200
        assert r.json()["status"] == "finished"


# -------- /api/stats miles aggregation --------
class TestStatsMiles:
    def test_stats_includes_miles_fields(self, client, auth):
        # Ensure profile baseline 850k from earlier test in module if run together; otherwise set
        client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Stats Driver", "years_experience": 12, "lifetime_miles": 850_000,
        })
        r = client.get(f"{BASE_URL}/api/stats")
        assert r.status_code == 200
        d = r.json()
        for key in ("miles_today", "miles_in_app", "miles_lifetime", "total_stops"):
            assert key in d, f"missing key {key}"
        assert d["miles_lifetime"] >= 850_000
        # miles_lifetime = baseline + miles_in_app
        assert d["miles_lifetime"] == 850_000 + d["miles_in_app"]


# -------- /api/achievements --------
class TestAchievements:
    """Originally complexity-11 god-test. Split per behavior."""

    REQUIRED_BADGE_KEYS = {"id", "category", "label", "threshold", "progress", "earned"}

    @pytest.fixture
    def achievements_doc(self, client):
        # set profile 12 yrs / 850k miles
        client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Ach Driver", "years_experience": 12, "lifetime_miles": 850_000,
        })
        r = client.get(f"{BASE_URL}/api/achievements")
        assert r.status_code == 200
        return r.json()

    def test_badges_is_a_list(self, achievements_doc):
        assert "badges" in achievements_doc
        assert isinstance(achievements_doc["badges"], list)

    def test_total_count_matches_badges_length(self, achievements_doc):
        assert achievements_doc["total_count"] == len(achievements_doc["badges"])

    def test_total_count_floor(self, achievements_doc):
        assert achievements_doc["total_count"] >= 20

    def test_earned_count_min_for_seeded_profile(self, achievements_doc):
        # 12 yrs (1,5,10 = 3) + 850k miles (100k,250k,500k = 3) = 6
        assert achievements_doc["earned_count"] >= 6, \
            f"expected >=6 earned, got {achievements_doc['earned_count']}"

    def test_locked_badges_progress_below_threshold(self, achievements_doc):
        for b in achievements_doc["badges"]:
            if not b["earned"]:
                assert b["progress"] < b["threshold"], \
                    f"locked badge {b['id']} has progress >= threshold"

    def test_every_badge_has_required_keys(self, achievements_doc):
        for b in achievements_doc["badges"]:
            assert self.REQUIRED_BADGE_KEYS <= set(b.keys()), \
                f"badge {b.get('id')} missing keys"
