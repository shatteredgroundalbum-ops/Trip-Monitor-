"""Iter 9 backend tests — Mileage-mode + Trip Recap.

Covers:
 - POST /api/profile accepts mileage_mode='workflow' and 'segment'; rejects 'garbage' (422).
 - POST /api/trip-sessions/{id}/finish auto-sums segment_miles when mode=segment AND total_trip_miles missing.
 - POST /api/trip-sessions/{id}/finish still 422s when mode=segment and all segment_miles empty.
 - GET /api/trip-sessions/{id}/recap full shape — career_before, career_after, next_milestone, new_badges.
 - GET /api/trip-sessions/{id}/recap 404 for unknown session.
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


def _seed_user():
    mc = MongoClient(MONGO_URL)
    db = mc[DB_NAME]
    suffix = str(int(time.time() * 1000))
    user_id = f"tm_iter9_pyt_{suffix}"
    token = f"tm_iter9_pyt_session_{suffix}"
    db.users.insert_one({
        "user_id": user_id,
        "email": f"iter9.pyt+{suffix}@rti.test",
        "name": "Iter9 Pytest",
        "picture": "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return db, user_id, token


def _cleanup(db, user_id, token):
    db.users.delete_one({"user_id": user_id})
    db.user_sessions.delete_one({"session_token": token})
    db.driver_profiles.delete_one({"user_id": user_id})
    db.trip_sessions.delete_many({"user_id": user_id})


@pytest.fixture(scope="module")
def auth():
    db, user_id, token = _seed_user()
    yield {"db": db, "user_id": user_id, "token": token}
    _cleanup(db, user_id, token)


@pytest.fixture
def client(auth):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {auth['token']}",
        "Content-Type": "application/json",
    })
    return s


# ---------------- /api/profile mileage_mode ----------------
class TestProfileMileageMode:
    @pytest.mark.parametrize("mode", ["workflow", "segment"])
    def test_valid_modes_accepted(self, client, mode):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Iter9 Pytest",
            "mileage_mode": mode,
            "time_zone": "UTC",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["mileage_mode"] == mode

        # GET back, persisted
        r2 = client.get(f"{BASE_URL}/api/profile")
        assert r2.status_code == 200
        assert r2.json()["mileage_mode"] == mode

    def test_invalid_mode_422(self, client):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Iter9 Pytest",
            "mileage_mode": "garbage",
            "time_zone": "UTC",
        })
        assert r.status_code == 422, r.text


# ---------------- /finish segment-sum auto-use ----------------
class TestFinishSegmentAutoSum:
    def _make_trip(self, client, rows):
        r = client.post(f"{BASE_URL}/api/trip-sessions", json={
            "session_type": "New",
            "load_type": "Store",
            "rows": rows,
        })
        assert r.status_code == 200, r.text
        return r.json()["session_id"]

    def test_segment_mode_auto_sums_when_total_missing(self, client):
        # Set mode=segment
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Iter9 Pytest",
            "mileage_mode": "segment",
            "time_zone": "UTC",
        })
        assert r.status_code == 200

        rows = [
            {"seq": 1, "segment_miles": 142},
            {"seq": 2, "segment_miles": 87},
            {"seq": 3, "segment_miles": 122},
            {"seq": 4},
        ]
        sid = self._make_trip(client, rows)

        # Note: NOT sending total_trip_miles; finish must auto-sum segments.
        r = client.post(f"{BASE_URL}/api/trip-sessions/{sid}/finish")
        assert r.status_code == 200, r.text
        doc = r.json()
        assert doc["status"] == "finished"
        assert doc["total_trip_miles"] == 351, f"expected 351, got {doc['total_trip_miles']}"
        assert doc.get("mileage_mode_at_finish") == "segment"

    def test_segment_mode_422_when_no_segments_and_no_total(self, client):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Iter9 Pytest",
            "mileage_mode": "segment",
            "time_zone": "UTC",
        })
        assert r.status_code == 200

        # All rows empty (no segment_miles, no total)
        rows = [{"seq": i + 1} for i in range(8)]
        sid = self._make_trip(client, rows)

        r = client.post(f"{BASE_URL}/api/trip-sessions/{sid}/finish")
        assert r.status_code == 422, r.text

    def test_workflow_mode_still_needs_total_trip_miles(self, client):
        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Iter9 Pytest",
            "mileage_mode": "workflow",
            "time_zone": "UTC",
        })
        assert r.status_code == 200

        rows = [{"seq": 1, "segment_miles": 100}]  # segments set but mode=workflow -> must ignore
        sid = self._make_trip(client, rows)

        r = client.post(f"{BASE_URL}/api/trip-sessions/{sid}/finish")
        assert r.status_code == 422, "workflow mode must not auto-sum segments"


# ---------------- /recap shape ----------------
class TestTripRecap:
    def test_recap_shape_with_milestone_and_badge(self, client, auth):
        """With baseline lifetime_miles=999700 + a 351mi trip:
            career_before=999700, career_after=1000051,
            new_badges contains miles_1000000, next_milestone.label='2M Miles'.
        """
        db = auth["db"]
        # clean prior trips/profile to isolate
        db.trip_sessions.delete_many({"user_id": auth["user_id"]})
        db.driver_profiles.delete_one({"user_id": auth["user_id"]})

        r = client.post(f"{BASE_URL}/api/profile", json={
            "full_name": "Iter9 Pytest",
            "mileage_mode": "segment",
            "lifetime_miles": 999700,
            "years_experience": 0,
            "time_zone": "UTC",
        })
        assert r.status_code == 200, r.text

        rows = [
            {"seq": 1, "segment_miles": 142},
            {"seq": 2, "segment_miles": 87},
            {"seq": 3, "segment_miles": 122},
        ]
        sid_r = client.post(f"{BASE_URL}/api/trip-sessions", json={"rows": rows})
        assert sid_r.status_code == 200
        sid = sid_r.json()["session_id"]

        fin = client.post(f"{BASE_URL}/api/trip-sessions/{sid}/finish")
        assert fin.status_code == 200, fin.text
        assert fin.json()["total_trip_miles"] == 351

        recap_r = client.get(f"{BASE_URL}/api/trip-sessions/{sid}/recap")
        assert recap_r.status_code == 200, recap_r.text
        recap = recap_r.json()

        # Required keys
        for key in ["trip_miles", "career_before", "career_after", "miles_today",
                    "miles_week", "next_milestone", "new_badges", "mileage_mode",
                    "trips_total", "finished_at"]:
            assert key in recap, f"missing {key}"

        assert recap["trip_miles"] == 351
        assert recap["career_before"] == 999700
        assert recap["career_after"] == 1000051
        assert recap["mileage_mode"] == "segment"
        assert recap["trips_total"] >= 1
        assert recap["miles_today"] >= 351
        assert recap["miles_week"] >= 351

        nm = recap["next_milestone"]
        assert nm is not None
        assert nm["label"] == "2M Miles", f"got {nm}"
        assert nm["threshold"] == 2_000_000
        assert nm["remaining"] == 2_000_000 - 1_000_051
        assert 0 <= nm["progress_pct"] <= 100

        new_ids = [b["id"] for b in recap["new_badges"]]
        assert "miles_1000000" in new_ids, f"got {new_ids}"
        mb = next(b for b in recap["new_badges"] if b["id"] == "miles_1000000")
        assert mb["label"] == "1M Miles"

    def test_recap_missing_session_404(self, client):
        r = client.get(f"{BASE_URL}/api/trip-sessions/ts_doesnotexist/recap")
        assert r.status_code == 404

    def test_recap_unauth_401(self):
        r = requests.get(f"{BASE_URL}/api/trip-sessions/ts_any/recap")
        assert r.status_code == 401
