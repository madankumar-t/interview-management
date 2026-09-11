from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app.state import local_state


async def _ta_user():
    return AuthContext(sub="demo-ta-1", email="ta@example.com", groups={Role.TA}, token_use="access")


def test_panel_can_be_created_filtered_and_deactivated(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(local_state, "users", {})
    app.dependency_overrides[get_current_user] = _ta_user
    client = TestClient(app)

    created = client.post(
        "/panels",
        json={
            "full_name": "Asha Rao",
            "email": "asha@example.com",
            "phone": "+91 9999999999",
            "panel_type": "External",
            "technologies": ["Python", "AWS"],
            "experience_years": 8.5,
            "designation": "Principal Engineer",
            "organization": "Partner Co",
        },
    )
    assert created.status_code == 201
    panel_id = created.json()["sub"]

    filtered = client.get("/panels/members?technology=python&panel_type=External")
    assert filtered.status_code == 200
    assert filtered.json()["panel_members"][0]["full_name"] == "Asha Rao"

    disabled = client.post(f"/panels/{panel_id}/status", json={"status": "Inactive"})
    assert disabled.status_code == 200
    assert client.get("/panels/members").json()["panel_members"] == []
    assert len(client.get("/panels/members?include_inactive=true").json()["panel_members"]) == 1
    app.dependency_overrides.clear()