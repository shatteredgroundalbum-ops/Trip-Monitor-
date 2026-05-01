"""Iter 8 backend tests:
   - GET /api/stats/week (auth required, 7 buckets, today flag)
   - Manifest + service worker static asset reachability/version
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


# ---------- Auth fixture ----------
@pytest.fixture(scope="module")
def auth():
    mc = MongoClient(MONGO_URL)
    db = mc[DB_NAME]
    suffix = str(int(time.time() * 1000))
    user_id = f"tm_iter8_pyt_{suffix}"
    token = f"tm_iter8_pyt_session_{suffix}"
    db.users.insert_one({
        "user_id": user_id,
        "email": f"iter8.pyt+{suffix}@rti.test",
        "name": "Iter8 Pytest",
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
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_one({"session_token": token})
    db.driver_profiles.delete_one({"user_id": user_id})
    db.trip_sessions.delete_many({"user_id": user_id})


@pytest.fixture
def client(auth):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {auth['token']}", "Content-Type": "application/json"})
    return s


def _seed_finished_trip(db, user_id, finished_dt_utc, miles, idx):
    db.trip_sessions.insert_one({
        "user_id": user_id,
        "session_id": f"sess_iter8_{idx}_{int(time.time()*1000)}",
        "status": "finished",
        "rows": [],
        "road_expenses": [],
        "total_trip_miles": miles,
        "started_at": (finished_dt_utc - timedelta(hours=4)).isoformat(),
        "finished_at": finished_dt_utc.isoformat(),
        "created_at": (finished_dt_utc - timedelta(hours=4)).isoformat(),
        "updated_at": finished_dt_utc.isoformat(),
    })


# ---------- /api/stats/week ----------
class TestStatsWeekShape:
    def test_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/stats/week")
        assert r.status_code == 401, r.text

    def test_empty_user_returns_7_buckets(self, client, auth):
        # ensure no trips
        auth["db"].trip_sessions.delete_many({"user_id": auth["user_id"]})
        r = client.get(f"{BASE_URL}/api/stats/week")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "time_zone" in data
        assert "miles_total_7d" in data
        assert "trips_total_7d" in data
        assert "miles_max" in data
        assert isinstance(data["days"], list)
        assert len(data["days"]) == 7

        # exactly one is_today, last entry
        today_flags = [d["is_today"] for d in data["days"]]
        assert today_flags.count(True) == 1
        assert data["days"][-1]["is_today"] is True

        # ordering: oldest -> newest
        dates = [d["date"] for d in data["days"]]
        assert dates == sorted(dates)

        # field shape per bucket
        valid_labels = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
        for d in data["days"]:
            assert d["label"] in valid_labels
            assert isinstance(d["miles"], int)
            assert isinstance(d["trips"], int)
            assert d["miles"] == 0
            assert d["trips"] == 0
            # date format YYYY-MM-DD
            datetime.strptime(d["date"], "%Y-%m-%d")

        # totals on empty
        assert data["miles_total_7d"] == 0
        assert data["trips_total_7d"] == 0
        assert data["miles_max"] == 0


class TestStatsWeekSeeded:
    def test_seeded_distribution(self, client, auth):
        db = auth["db"]
        user_id = auth["user_id"]
        # clear & set time zone to UTC for deterministic bucketing
        db.trip_sessions.delete_many({"user_id": user_id})
        db.driver_profiles.update_one(
            {"user_id": user_id},
            {"$set": {"user_id": user_id, "time_zone": "UTC"}},
            upsert=True,
        )

        # Use noon UTC on each target day to avoid edge cases.
        now_utc = datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0)
        plan = [
            (0, 320),   # today
            (1, 415),   # day-1
            (3, 180),   # day-3
            (5, 540),   # day-5
        ]
        for i, (offset, miles) in enumerate(plan):
            _seed_finished_trip(db, user_id, now_utc - timedelta(days=offset), miles, i)

        r = client.get(f"{BASE_URL}/api/stats/week")
        assert r.status_code == 200, r.text
        data = r.json()

        assert data["miles_total_7d"] == 1455
        assert data["trips_total_7d"] == 4
        assert data["miles_max"] == 540
        assert len(data["days"]) == 7

        # Last bucket (today) should have 320 miles, 1 trip
        today_bucket = data["days"][-1]
        assert today_bucket["is_today"] is True
        assert today_bucket["miles"] == 320
        assert today_bucket["trips"] == 1

        # Map by offset from today (today index = 6)
        # day-1 -> idx 5, day-3 -> idx 3, day-5 -> idx 1
        assert data["days"][5]["miles"] == 415
        assert data["days"][5]["trips"] == 1
        assert data["days"][3]["miles"] == 180
        assert data["days"][3]["trips"] == 1
        assert data["days"][1]["miles"] == 540
        assert data["days"][1]["trips"] == 1

        # Other days (idx 0,2,4) should be 0
        for idx in (0, 2, 4):
            assert data["days"][idx]["miles"] == 0
            assert data["days"][idx]["trips"] == 0

        # cleanup trips
        db.trip_sessions.delete_many({"user_id": user_id})


# ---------- Static PWA assets ----------
class TestPwaAssets:
    def test_manifest_reachable_and_valid(self):
        r = requests.get(f"{BASE_URL}/manifest.json")
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"]
        assert data["short_name"]
        assert data["start_url"]
        assert data["display"] == "standalone"
        assert data["theme_color"]
        icons = data["icons"]
        assert isinstance(icons, list) and len(icons) >= 2
        sizes = {i["sizes"] for i in icons}
        assert "192x192" in sizes
        assert "512x512" in sizes
        shortcuts = data.get("shortcuts", [])
        assert isinstance(shortcuts, list) and len(shortcuts) >= 1

    def test_service_worker_versioned(self):
        r = requests.get(f"{BASE_URL}/service-worker.js")
        assert r.status_code == 200, r.text
        assert "trip-monitor-v2" in r.text
