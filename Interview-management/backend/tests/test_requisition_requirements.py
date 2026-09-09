from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role


def _override(user: AuthContext):
    async def dep():
        return user

    return dep


def test_requisition_captures_intake_and_client_details(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="demo-ta-1", groups={Role.TA}, token_use="access", authz_version=1)
    )
    client = TestClient(app)
    payload = {
        "requisition_id": "REQ-200",
        "title": "Senior Full Stack Engineer",
        "department": "Engineering",
        "project": "Core",
        "hiring_manager_sub": "demo-manager-1",
        "required_skills": ["python", "react", "aws"],
        "status": "Sourcing",
        "intake_received_at_utc": "2026-09-09T06:30:00Z",
        "positions_total": 5,
        "positions_filled": 2,
        "client_name": "Contoso Ltd",
        "client_contact_name": "Priya Shah",
    }
    response = client.post("/requisitions", json=payload)
    assert response.status_code == 201
    body = response.json()
    assert body["positions_open"] == 3
    assert body["status"] == "Sourcing"
    assert body["client_name"] == "Contoso Ltd"
    app.dependency_overrides.clear()


def test_requisition_rejects_invalid_position_counts(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="demo-ta-1", groups={Role.TA}, token_use="access", authz_version=1)
    )
    client = TestClient(app)
    payload = {
        "requisition_id": "REQ-201",
        "title": "Backend Engineer",
        "department": "Engineering",
        "project": "Core",
        "hiring_manager_sub": "demo-manager-1",
        "status": "Approved",
        "intake_received_at_utc": "2026-09-09T06:30:00Z",
        "positions_total": 2,
        "positions_filled": 3,
        "client_name": "Fabrikam Inc",
    }
    response = client.post("/requisitions", json=payload)
    assert response.status_code == 422
    app.dependency_overrides.clear()

