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


def _assert_bucket_shape(bucket):
    """One bucket per local day must have well-formed label/miles/trips/date."""
    valid_labels = {"Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"}
    assert bucket["label"] in valid_labels
    assert isinstance(bucket["miles"], int)
    assert isinstance(bucket["trips"], int)
    # date format YYYY-MM-DD
    datetime.strptime(bucket["date"], "%Y-%m-%d")


# ---------- /api/stats/week ----------
class TestStatsWeekShape:
    """Originally a single complexity-22 god-test. Split into focused
    one-assertion-per-behavior cases sharing a small `empty_week` fixture."""

    @pytest.fixture
    def empty_week(self, client, auth):
        # ensure no trips
        auth["db"].trip_sessions.delete_many({"user_id": auth["user_id"]})
        r = client.get(f"{BASE_URL}/api/stats/week")
        assert r.status_code == 200, r.text
        return r.json()

    def test_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/stats/week")
        assert r.status_code == 401, r.text

    @pytest.mark.parametrize("key", [
        "time_zone", "miles_total_7d", "trips_total_7d", "miles_max",
    ])
    def test_top_level_key_present(self, empty_week, key):
        assert key in empty_week

    def test_returns_exactly_7_buckets(self, empty_week):
        assert isinstance(empty_week["days"], list)
        assert len(empty_week["days"]) == 7

    def test_today_flag_only_on_last_bucket(self, empty_week):
        today_flags = [d["is_today"] for d in empty_week["days"]]
        assert today_flags.count(True) == 1
        assert empty_week["days"][-1]["is_today"]  # truthy = today flag set

    def test_dates_chronological(self, empty_week):
        dates = [d["date"] for d in empty_week["days"]]
        assert dates == sorted(dates)

    def test_each_bucket_has_valid_shape(self, empty_week):
        for d in empty_week["days"]:
            _assert_bucket_shape(d)

    def test_empty_buckets_have_zero_metrics(self, empty_week):
        assert all(d["miles"] == 0 for d in empty_week["days"])
        assert all(d["trips"] == 0 for d in empty_week["days"])

    def test_empty_totals_zero(self, empty_week):
        assert empty_week["miles_total_7d"] == 0
        assert empty_week["trips_total_7d"] == 0
        assert empty_week["miles_max"] == 0


class TestStatsWeekSeeded:
    """Originally complexity-19 / 52-line god-test. Split into focused
    cases sharing a class-scoped fixture that seeds the trips once."""

    # Maps day-offset → expected (miles, day_index_in_response)
    SEED_PLAN = [
        (0, 320, 6),  # today      -> idx 6
        (1, 415, 5),
        (3, 180, 3),
        (5, 540, 1),
    ]

    @pytest.fixture
    def seeded_week(self, client, auth):
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
        now_utc = datetime.now(timezone.utc).replace(
            hour=12, minute=0, second=0, microsecond=0
        )
        for i, (offset, miles, _idx) in enumerate(self.SEED_PLAN):
            _seed_finished_trip(db, user_id, now_utc - timedelta(days=offset), miles, i)
        r = client.get(f"{BASE_URL}/api/stats/week")
        assert r.status_code == 200, r.text
        yield r.json()
        db.trip_sessions.delete_many({"user_id": user_id})

    def test_seeded_miles_total(self, seeded_week):
        assert seeded_week["miles_total_7d"] == 1455

    def test_seeded_trip_count(self, seeded_week):
        assert seeded_week["trips_total_7d"] == 4

    def test_seeded_miles_max(self, seeded_week):
        assert seeded_week["miles_max"] == 540

    def test_seeded_returns_7_buckets(self, seeded_week):
        assert len(seeded_week["days"]) == 7

    def test_today_bucket_marked(self, seeded_week):
        assert seeded_week["days"][-1]["is_today"]  # truthy = today flag set

    @pytest.mark.parametrize("offset,miles,idx", SEED_PLAN)
    def test_seeded_miles_at_index(self, seeded_week, offset, miles, idx):
        assert seeded_week["days"][idx]["miles"] == miles
        assert seeded_week["days"][idx]["trips"] == 1

    @pytest.mark.parametrize("idx", [0, 2, 4])
    def test_unseeded_days_zero(self, seeded_week, idx):
        assert seeded_week["days"][idx]["miles"] == 0
        assert seeded_week["days"][idx]["trips"] == 0


# ---------- Static PWA assets ----------
class TestPwaAssets:
    """Originally complexity-14 god-test. Split per spec field."""

    @pytest.fixture(scope="class")
    def manifest(self):
        r = requests.get(f"{BASE_URL}/manifest.json")
        assert r.status_code == 200, r.text
        return r.json()

    @pytest.mark.parametrize("key", ["name", "short_name", "start_url", "theme_color"])
    def test_manifest_required_field_present(self, manifest, key):
        assert manifest.get(key)

    def test_manifest_display_standalone(self, manifest):
        assert manifest["display"] == "standalone"

    def test_manifest_has_icons_list(self, manifest):
        icons = manifest["icons"]
        assert isinstance(icons, list) and len(icons) >= 2

    @pytest.mark.parametrize("required_size", ["192x192", "512x512"])
    def test_manifest_icon_size_present(self, manifest, required_size):
        sizes = {i["sizes"] for i in manifest["icons"]}
        assert required_size in sizes

    def test_manifest_has_shortcuts(self, manifest):
        shortcuts = manifest.get("shortcuts", [])
        assert isinstance(shortcuts, list) and len(shortcuts) >= 1

    def test_service_worker_versioned(self):
        r = requests.get(f"{BASE_URL}/service-worker.js")
        assert r.status_code == 200, r.text
        assert "trip-monitor-v2" in r.text
