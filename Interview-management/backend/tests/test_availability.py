from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app.repository import DynamoRepository
from app.scheduling import InMemoryScheduleStore
from app.state import local_state


def _user(sub: str, role: Role):
    async def current_user():
        return AuthContext(
            sub=sub,
            email=f"{sub}@example.com",
            groups={role},
            token_use="access",
            authz_version=1,
        )

    return current_user


def test_panel_can_save_and_read_own_availability(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(
        local_state,
        "users",
        {
            "panel-a": {
                "sub": "panel-a",
                "groups": ["Panel"],
                "status": "ACTIVE",
                "authz_version": 1,
            }
        },
    )
    app.dependency_overrides[get_current_user] = _user("panel-a", Role.PANEL)
    client = TestClient(app)
    slots = [
        {
            "start_utc": "2026-09-20T04:30:00Z",
            "end_utc": "2026-09-20T06:30:00Z",
            "timezone": "Asia/Kolkata",
        }
    ]

    saved = client.put("/availability/me", json={"slots": slots})
    assert saved.status_code == 200
    assert client.get("/availability/me").json()["availability"] == saved.json()["availability"]
    app.dependency_overrides.clear()


def test_repository_persists_availability_for_production() -> None:
    class FakeDynamoClient:
        def __init__(self):
            self.items = []

        def transact_write_items(self, TransactItems):  # noqa: N803
            self.items = TransactItems

        def get_item(self, **_kwargs):
            return {"Item": self.items[0]["Put"]["Item"]}

    repo = DynamoRepository.__new__(DynamoRepository)
    repo.client = FakeDynamoClient()
    repo.table_name = "test-table"
    slots = [
        {
            "start_utc": "2026-09-20T04:30:00Z",
            "end_utc": "2026-09-20T06:30:00Z",
            "timezone": "Asia/Kolkata",
        }
    ]

    repo.put_availability("panel-a", slots, "panel@example.com", ["Panel"])

    assert repo.get_availability("panel-a") == slots
    assert repo.client.items[0]["Put"]["Item"]["pk"]["S"] == "USER#panel-a"


def test_ta_can_schedule_only_within_panel_availability(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(
        local_state,
        "users",
        {
            "ta-a": {
                "sub": "ta-a",
                "groups": ["TA"],
                "status": "ACTIVE",
                "authz_version": 1,
            },
            "panel-a": {
                "sub": "panel-a",
                "groups": ["Panel"],
                "status": "ACTIVE",
                "authz_version": 1,
                "availability": [
                    {
                        "start_utc": "2026-09-20T04:30:00+00:00",
                        "end_utc": "2026-09-20T06:30:00+00:00",
                        "timezone": "Asia/Kolkata",
                    }
                ],
            },
        },
    )
    monkeypatch.setattr(
        local_state,
        "requisitions",
        {
            "REQ-1": {
                "requisition_id": "REQ-1",
                "title": "Engineer",
                "department": "Engineering",
                "project": "Core",
                "client_name": "Acme",
            }
        },
    )
    monkeypatch.setattr(local_state, "scheduling_store", InMemoryScheduleStore())
    app.dependency_overrides[get_current_user] = _user("ta-a", Role.TA)
    client = TestClient(app)
    base_payload = {
        "candidate_id": "candidate-1",
        "requisition_id": "REQ-1",
        "round_name": "technical",
        "interview_type": "Round 1",
        "required_skills": ["Python"],
        "panel_subs": ["panel-a"],
        "lead_panel_sub": "panel-a",
        "timezone": "Asia/Kolkata",
        "mode": "Online",
        "meeting_url": "https://example.test/interview",
        "idempotency_key": "available-slot",
    }

    available = client.post(
        "/interviews",
        json={
            **base_payload,
            "start_local_iso": "2026-09-20T10:00:00",
            "end_local_iso": "2026-09-20T11:00:00",
        },
    )
    assert available.status_code == 201

    unavailable = client.post(
        "/interviews",
        json={
            **base_payload,
            "start_local_iso": "2026-09-20T12:30:00",
            "end_local_iso": "2026-09-20T13:30:00",
            "idempotency_key": "outside-slot",
        },
    )
    assert unavailable.status_code == 409
    assert "panel-a" in unavailable.json()["detail"]

    cannot_administer_panels = client.post(
        "/panels",
        json={
            "full_name": "Another Panel",
            "email": "panel@example.com",
            "panel_type": "External",
            "technologies": ["Python"],
            "experience_years": 5,
        },
    )
    assert cannot_administer_panels.status_code == 403
    app.dependency_overrides.clear()
