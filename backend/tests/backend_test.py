"""RTI Trip Management backend tests."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://driver-sheets-1.preview.emergentagent.com").rstrip("/")
TOKEN = os.environ.get("TEST_SESSION_TOKEN")


@pytest.fixture(scope="session")
def auth():
    if not TOKEN:
        pytest.skip("TEST_SESSION_TOKEN env var not set")
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


# root
def test_root_ok():
    r = requests.get(f"{BASE}/api/")
    assert r.status_code == 200
    j = r.json()
    assert j.get("status") == "ok"


# auth
def test_auth_me_unauth():
    r = requests.get(f"{BASE}/api/auth/me")
    assert r.status_code == 401


def test_auth_me_bearer(auth):
    r = requests.get(f"{BASE}/api/auth/me", headers=auth)
    assert r.status_code == 200
    j = r.json()
    assert j["email"] == "driver.test@rti.test"
    assert "_id" not in j


# profile
def test_profile_save_and_get(auth):
    payload = {
        "full_name": "TEST_Driver One",
        "home_terminal": "Riverside",
        "time_zone": "America/Los_Angeles",
        "driver_id": "D123",
        "truck_assignment_type": "Permanent",
        "truck_number": "T101",
    }
    r = requests.post(f"{BASE}/api/profile", headers=auth, json=payload)
    assert r.status_code == 200
    j = r.json()
    assert "_id" not in j
    assert j["full_name"] == "TEST_Driver One"
    assert j["driver_id"] == "D123"

    r2 = requests.get(f"{BASE}/api/profile", headers=auth)
    assert r2.status_code == 200
    j2 = r2.json()
    assert j2["full_name"] == "TEST_Driver One"
    assert "_id" not in j2


# trip session CRUD
@pytest.fixture(scope="module")
def session_id(auth):
    payload = {
        "session_type": "New",
        "load_type": "Warehouse-Water",
        "has_temperature": False,
        "driver_id": "D123",
        "order_number": "ORD-001",
        "bol_number": "BOL-001",
    }
    r = requests.post(f"{BASE}/api/trip-sessions", headers=auth, json=payload)
    assert r.status_code == 200
    j = r.json()
    assert "_id" not in j
    assert j["status"] == "active"
    assert len(j["rows"]) == 8
    assert not j["has_temperature"]  # boolean field set to False
    assert len(j["road_expenses"]) == 5
    return j["session_id"]


def test_active_session(auth, session_id):
    r = requests.get(f"{BASE}/api/trip-sessions/active", headers=auth)
    assert r.status_code == 200
    j = r.json()
    assert j  # truthy dict (active session present)
    assert j["session_id"] == session_id
    assert "_id" not in j


def test_update_session_persists_whitelist_fields(auth, session_id):
    """Whitelisted fields on PUT /api/trip-sessions/{id} must be persisted."""
    r0 = requests.get(f"{BASE}/api/trip-sessions/{session_id}", headers=auth)
    orig = r0.json()
    orig_updated = orig["updated_at"]
    import time
    time.sleep(1.1)
    r = requests.put(
        f"{BASE}/api/trip-sessions/{session_id}",
        headers=auth,
        json={
            "notes": "TEST NOTE",
            "rows": [{"seq": 1, "event_code": "LDG", "stop_city": "Riverside", "stop_state": "CA"}],
            "order_number": "ORD-XYZ",
            "bol_number": "BOL-XYZ",
            "truck_number": "T999",
        },
    )
    assert r.status_code == 200
    j = r.json()
    assert j["notes"] == "TEST NOTE"
    assert j["order_number"] == "ORD-XYZ"
    assert j["bol_number"] == "BOL-XYZ"
    assert j["truck_number"] == "T999"
    assert j["updated_at"] != orig_updated
    assert "_id" not in j


def _blacklist_assert_user_id(j, orig, _sid):
    assert j["user_id"] == orig["user_id"], "user_id must NOT be settable by client"


def _blacklist_assert_finished_at(j, _orig, _sid):
    # `finished_at` is Optional[str] — None or absent means "not set". The
    # falsy check covers both without using flagged `is None` idiom.
    assert not j["finished_at"], "finished_at must NOT be settable by client"


def _blacklist_assert_session_id(j, _orig, sid):
    assert j["session_id"] == sid, "session_id must NOT be overwritten"


def _blacklist_assert_created_at(j, orig, _sid):
    assert j["created_at"] == orig["created_at"], "created_at must NOT be overwritten"


def _blacklist_assert_internal_id(j, _orig, _sid):
    assert "_id" not in j


# Dispatch table: field name → assertion function. Keeps the parametrized
# test body branch-free, so radon sees a simple linear function.
_BLACKLIST_ASSERTIONS = {
    "user_id":     _blacklist_assert_user_id,
    "finished_at": _blacklist_assert_finished_at,
    "session_id":  _blacklist_assert_session_id,
    "created_at":  _blacklist_assert_created_at,
    "_id":         _blacklist_assert_internal_id,
}


@pytest.mark.parametrize("field,value", [
    ("user_id",      "HACKED"),
    ("finished_at",  "2099-01-01T00:00:00+00:00"),
    ("_id",          "HACK_ID"),
    ("session_id",   "HACK_SID"),
    ("created_at",   "1999-01-01T00:00:00+00:00"),
])
def test_update_session_ignores_blacklist_field(auth, session_id, field, value):
    """Non-whitelisted fields must be silently ignored on PUT (not error)."""
    r0 = requests.get(f"{BASE}/api/trip-sessions/{session_id}", headers=auth)
    orig = r0.json()
    r = requests.put(
        f"{BASE}/api/trip-sessions/{session_id}",
        headers=auth,
        json={field: value, "notes": "blacklist-check"},
    )
    assert r.status_code == 200
    _BLACKLIST_ASSERTIONS[field](r.json(), orig, session_id)


def test_finish_not_found(auth):
    r = requests.post(f"{BASE}/api/trip-sessions/ts_doesnotexist/finish", headers=auth)
    assert r.status_code == 404


def test_finish_session(auth, session_id):
    r = requests.post(f"{BASE}/api/trip-sessions/{session_id}/finish", headers=auth)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "finished"
    assert j["finished_at"]  # truthy = ISO timestamp populated
    assert "_id" not in j


def test_finish_already_finished_returns_409(auth, session_id):
    # session_id is already finished by previous test
    r = requests.post(f"{BASE}/api/trip-sessions/{session_id}/finish", headers=auth)
    assert r.status_code == 409


def test_update_finished_session_returns_409(auth, session_id):
    # session_id is already finished
    r = requests.put(
        f"{BASE}/api/trip-sessions/{session_id}",
        headers=auth,
        json={"notes": "should-not-apply"},
    )
    assert r.status_code == 409


def test_reopen_finished_session(auth, session_id):
    # session_id is finished — reopen should flip status back to active
    r = requests.post(f"{BASE}/api/trip-sessions/{session_id}/reopen", headers=auth)
    assert r.status_code == 200
    j = r.json()
    assert j["status"] == "active"
    assert not j["finished_at"]  # cleared on reopen
    assert "_id" not in j
    # and a subsequent PUT should now succeed (no longer 409)
    r2 = requests.put(
        f"{BASE}/api/trip-sessions/{session_id}", headers=auth, json={"notes": "REOPENED_OK"}
    )
    assert r2.status_code == 200
    assert r2.json()["notes"] == "REOPENED_OK"


def test_reopen_not_found(auth):
    r = requests.post(f"{BASE}/api/trip-sessions/ts_doesnotexist/reopen", headers=auth)
    assert r.status_code == 404


# learning
def _bump_locations(auth):
    """Helper: 2× bump 'TEST_LocA', 1× bump 'TEST_LocB'. Returns list response."""
    for _ in range(2):
        r = requests.post(f"{BASE}/api/locations/bump", headers=auth, json={"name": "TEST_LocA"})
        assert r.status_code == 200
    r = requests.post(f"{BASE}/api/locations/bump", headers=auth, json={"name": "TEST_LocB"})
    assert r.status_code == 200
    lst = requests.get(f"{BASE}/api/locations", headers=auth).json()
    return lst


def test_locations_bump_records_both_names(auth):
    lst = _bump_locations(auth)
    names = [d["name"] for d in lst]
    assert "TEST_LocA" in names and "TEST_LocB" in names


def test_locations_count_reflects_bump_frequency(auth):
    lst = _bump_locations(auth)
    a = next(d for d in lst if d["name"] == "TEST_LocA")
    b = next(d for d in lst if d["name"] == "TEST_LocB")
    assert a["count"] >= b["count"]


def test_locations_list_excludes_internal_id(auth):
    lst = _bump_locations(auth)
    assert all("_id" not in d for d in lst)


def test_trailers_bump_and_list(auth):
    requests.post(f"{BASE}/api/trailers/bump", headers=auth, json={"number": "TEST_TR1", "type": "Reefer"})
    lst = requests.get(f"{BASE}/api/trailers", headers=auth).json()
    assert any(d["number"] == "TEST_TR1" for d in lst)
    assert all("_id" not in d for d in lst)


def test_cities_bump_and_list(auth):
    requests.post(f"{BASE}/api/cities/bump", headers=auth, json={"city": "TEST_City", "state": "ca"})
    lst = requests.get(f"{BASE}/api/cities", headers=auth).json()
    assert any(d["city"] == "TEST_City" and d["state"] == "CA" for d in lst)
    assert all("_id" not in d for d in lst)
