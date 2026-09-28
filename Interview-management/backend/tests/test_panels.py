from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.availability_service import unavailable_panel_subs
from app.main import app
from app.models import AuthContext, Role
from app.state import local_state


async def _manager_user():
    return AuthContext(sub="demo-manager-1", email="manager@example.com", groups={Role.MANAGER}, token_use="access")


def test_panel_can_be_created_filtered_and_deactivated(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(local_state, "users", {})
    app.dependency_overrides[get_current_user] = _manager_user
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


def test_existing_external_panel_uses_matching_login_availability(monkeypatch) -> None:
    class FakeRepo:
        def list_panels(self):
            return [{
                "panel_id": "legacy-panel-id",
                "sub": "legacy-panel-id",
                "login_sub": "",
                "email": "panel@example.com",
                "full_name": "Panel Member",
                "panel_type": "External",
                "skills": [],
                "status": "Active",
                "availability_slots": 0,
            }]

        def get_availability(self, sub):
            assert sub == "login-sub"
            return [{"start_utc": "2026-09-27T03:30:00+00:00", "end_utc": "2026-09-27T11:30:00+00:00"}]

    class FakeCognito:
        def list_users(self):
            return [{"sub": "login-sub", "email": "panel@example.com", "groups": ["Panel"], "enabled": True}]

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr("app.routers.panels.DynamoRepository", FakeRepo)
    monkeypatch.setattr("app.routers.panels.CognitoAdmin", FakeCognito)
    app.dependency_overrides[get_current_user] = _manager_user
    try:
        response = TestClient(app).get("/panels/members")
        assert response.status_code == 200
        member = response.json()["panel_members"][0]
        assert member["sub"] == "login-sub"
        assert member["login_sub"] == "login-sub"
        assert member["availability_slots"] == 1
        assert unavailable_panel_subs(
            [member["sub"]], "2026-09-27T04:30:00+00:00", "2026-09-27T05:30:00+00:00", repo=FakeRepo()
        ) == []
    finally:
        app.dependency_overrides.clear()


def test_available_slots_exclude_unavailable_and_overlapping_interviews(monkeypatch) -> None:
    from app.routers import panels

    async def ta_user():
        return AuthContext(sub="ta-1", email="ta@example.com", groups={Role.TA}, token_use="access")

    monkeypatch.setattr(panels, "get_user_availability", lambda sub: [{
        "start_utc": "2030-09-27T04:00:00+00:00" if sub == "panel-1" else "2030-09-27T04:30:00+00:00",
        "end_utc": "2030-09-27T07:00:00+00:00",
    }])
    monkeypatch.setattr(panels, "reporting_records", lambda: ([], [{
        "start_utc": "2030-09-27T05:30:00+00:00", "end_utc": "2030-09-27T06:00:00+00:00",
        "panel_subs": ["panel-2"], "status": "Scheduled",
    }]))
    app.dependency_overrides[get_current_user] = ta_user
    try:
        response = TestClient(app).get("/panels/available-slots", params={
            "panel_subs": "panel-1,panel-2", "date": "2030-09-27", "timezone": "Asia/Kolkata", "duration_minutes": 30,
        })
        assert response.status_code == 200
        starts = [slot["start_utc"] for slot in response.json()["slots"]]
        assert "2030-09-27T04:30:00+00:00" in starts
        assert "2030-09-27T05:00:00+00:00" not in starts
        assert "2030-09-27T05:15:00+00:00" not in starts
        assert "2030-09-27T05:30:00+00:00" not in starts
        assert "2030-09-27T06:00:00+00:00" not in starts
        assert "2030-09-27T06:30:00+00:00" in starts
        assert "2030-09-27T04:00:00+00:00" not in starts
        assert TestClient(app).get("/panels/available-slots", params={
            "panel_subs": "panel-1,panel-2", "date": "2030-09-27", "timezone": "Asia/Kolkata",
            "duration_minutes": 30, "candidate_id": "candidate-1",
        }).status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_admin_slots_exclude_candidate_booking_even_with_another_panel(monkeypatch) -> None:
    from app.routers import panels

    async def admin_user():
        return AuthContext(sub="admin-1", email="admin@example.com", groups={Role.ADMINISTRATOR}, token_use="access")

    booking = {
        "start_utc": "2030-09-27T05:30:00+00:00", "end_utc": "2030-09-27T06:30:00+00:00",
        "panel_subs": ["other-panel"], "candidate_id": "candidate-1", "status": "Scheduled", "interview_id": "existing-1",
    }
    monkeypatch.setattr(panels, "get_user_availability", lambda _sub: [{
        "start_utc": "2030-09-27T04:30:00+00:00", "end_utc": "2030-09-27T07:30:00+00:00",
    }])
    monkeypatch.setattr(panels, "reporting_records", lambda: ([], [booking]))
    monkeypatch.setattr(panels, "visible_records", lambda _user: ([], [booking]))
    monkeypatch.setattr(panels, "unavailable_panel_subs", lambda *_args: [])
    app.dependency_overrides[get_current_user] = admin_user
    try:
        client = TestClient(app)
        params = {"panel_subs": "panel-1", "candidate_id": "candidate-1", "date": "2030-09-27",
                  "timezone": "Asia/Kolkata", "duration_minutes": 30}
        response = client.get("/panels/available-slots", params=params)
        assert response.status_code == 200
        starts = [slot["start_utc"] for slot in response.json()["slots"]]
        assert "2030-09-27T05:00:00+00:00" not in starts
        assert "2030-09-27T07:00:00+00:00" in starts
        conflict = client.get("/panels/conflicts", params={
            "panel_subs": "panel-1", "candidate_id": "candidate-1",
            "start_utc": "2030-09-27T05:00:00+00:00", "end_utc": "2030-09-27T05:30:00+00:00",
        })
        assert conflict.status_code == 200
        assert conflict.json()["conflicts"][0]["candidate_overlap"] is True
    finally:
        app.dependency_overrides.clear()