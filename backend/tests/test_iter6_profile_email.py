"""Iteration 6 — Pydantic validation on /api/profile + Resend email endpoint tests."""
import os
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://driver-sheets-1.preview.emergentagent.com").rstrip("/")
TOKEN = os.environ.get("TEST_SESSION_TOKEN")


@pytest.fixture(scope="module")
def auth():
    if not TOKEN:
        pytest.skip("TEST_SESSION_TOKEN env not set")
    return {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


# ---------- /api/profile strict Pydantic validation ----------
class TestProfileValidation:
    def test_missing_required_fields_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/profile", headers=auth, json={})
        assert r.status_code == 422

    def test_missing_some_required_fields_returns_422(self, auth):
        # missing truck_assignment_type + driver_id
        r = requests.post(f"{BASE}/api/profile", headers=auth, json={
            "full_name": "X", "home_terminal": "Y", "time_zone": "America/Chicago"
        })
        assert r.status_code == 422

    def test_permanent_without_truck_number_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/profile", headers=auth, json={
            "full_name": "TEST_Permanent",
            "home_terminal": "Riverside",
            "time_zone": "America/Los_Angeles",
            "driver_id": "D001",
            "truck_assignment_type": "Permanent",
            # truck_number missing
        })
        assert r.status_code == 422
        detail = r.json().get("detail", "")
        assert "truck_number" in str(detail).lower()

    def test_invalid_assignment_type_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/profile", headers=auth, json={
            "full_name": "TEST_Bad",
            "home_terminal": "Riverside",
            "time_zone": "America/Los_Angeles",
            "driver_id": "D001",
            "truck_assignment_type": "InvalidValue",
            "truck_number": "T1",
        })
        assert r.status_code == 422

    def test_invalid_dispatcher_email_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/profile", headers=auth, json={
            "full_name": "TEST_BadEmail",
            "home_terminal": "Riverside",
            "time_zone": "America/Los_Angeles",
            "driver_id": "D001",
            "truck_assignment_type": "Slip Seat",
            "dispatcher_email": "not-an-email",
        })
        assert r.status_code == 422

    def test_slip_seat_without_truck_ok(self, auth):
        r = requests.post(f"{BASE}/api/profile", headers=auth, json={
            "full_name": "TEST_SlipSeat",
            "home_terminal": "Riverside",
            "time_zone": "America/Los_Angeles",
            "driver_id": "D002",
            "truck_assignment_type": "Slip Seat",
        })
        assert r.status_code == 200
        j = r.json()
        assert "_id" not in j
        assert j["truck_assignment_type"] == "Slip Seat"

    def test_valid_profile_with_dispatcher_email_persists(self, auth):
        payload = {
            "full_name": "TEST_Dispatch Driver",
            "home_terminal": "Riverside",
            "time_zone": "America/Los_Angeles",
            "driver_id": "D777",
            "truck_assignment_type": "Permanent",
            "truck_number": "T777",
            "dispatcher_email": "dispatch@example.com",
        }
        r = requests.post(f"{BASE}/api/profile", headers=auth, json=payload)
        assert r.status_code == 200
        j = r.json()
        assert "_id" not in j
        assert j["dispatcher_email"] == "dispatch@example.com"
        assert j["full_name"] == "TEST_Dispatch Driver"

        # GET confirms persistence
        r2 = requests.get(f"{BASE}/api/profile", headers=auth)
        assert r2.status_code == 200
        j2 = r2.json()
        assert j2["dispatcher_email"] == "dispatch@example.com"
        assert j2["truck_number"] == "T777"
        assert "_id" not in j2


# ---------- /api/email/send-trip-sheet ----------
class TestEmailSendTripSheet:
    VALID_PAYLOAD = {
        "recipient": "to@example.com",
        "subject": "Trip Sheet — Test",
        "html_body": "<p>hi</p>",
        "attachments": [],
    }

    def test_no_auth_returns_401(self):
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", json=self.VALID_PAYLOAD)
        assert r.status_code == 401

    def test_auth_no_resend_key_returns_503(self, auth):
        # RESEND_API_KEY is intentionally empty in backend .env
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", headers=auth, json=self.VALID_PAYLOAD)
        assert r.status_code == 503
        detail = r.json().get("detail", "")
        assert "not configured" in str(detail).lower()

    def test_missing_recipient_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", headers=auth, json={
            "subject": "s", "html_body": "<p>b</p>"
        })
        assert r.status_code == 422

    def test_missing_subject_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", headers=auth, json={
            "recipient": "to@example.com", "html_body": "<p>b</p>"
        })
        assert r.status_code == 422

    def test_missing_html_body_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", headers=auth, json={
            "recipient": "to@example.com", "subject": "s"
        })
        assert r.status_code == 422

    def test_malformed_recipient_returns_422(self, auth):
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", headers=auth, json={
            "recipient": "not-an-email", "subject": "s", "html_body": "<p>b</p>"
        })
        assert r.status_code == 422

    def test_more_than_four_attachments_returns_422(self, auth):
        payload = {
            "recipient": "to@example.com",
            "subject": "s",
            "html_body": "<p>b</p>",
            "attachments": [
                {"filename": f"f{i}.txt", "content_b64": "aGVsbG8=", "content_type": "text/plain"}
                for i in range(5)
            ],
        }
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", headers=auth, json=payload)
        assert r.status_code == 422

    def test_empty_attachment_filename_returns_422(self, auth):
        payload = {
            "recipient": "to@example.com",
            "subject": "s",
            "html_body": "<p>b</p>",
            "attachments": [{"filename": "", "content_b64": "aGVsbG8=", "content_type": "text/plain"}],
        }
        r = requests.post(f"{BASE}/api/email/send-trip-sheet", headers=auth, json=payload)
        assert r.status_code == 422
