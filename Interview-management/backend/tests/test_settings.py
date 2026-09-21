from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app.state import local_state


def _user(role: Role):
    async def current_user():
        return AuthContext(sub="actor-1", email="actor@example.com", groups={role}, token_use="access")

    return current_user


def test_any_authenticated_user_can_read_organization_settings_in_demo_mode(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(
        local_state,
        "organization_settings",
        {
            "company_name": "Acme Corp",
            "support_email": "help@acme.example",
            "support_phone": None,
            "logo_url": None,
            "updated_at": "2026-01-01T00:00:00+00:00",
            "updated_by": "admin-1",
        },
    )
    app.dependency_overrides[get_current_user] = _user(Role.PANEL)
    try:
        response = TestClient(app).get("/settings/organization")
        assert response.status_code == 200
        assert response.json()["company_name"] == "Acme Corp"
    finally:
        app.dependency_overrides.clear()


def test_administrator_can_update_organization_settings_in_demo_mode(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    app.dependency_overrides[get_current_user] = _user(Role.ADMINISTRATOR)
    try:
        response = TestClient(app).put(
            "/settings/organization",
            json={
                "company_name": "New Co",
                "support_email": "support@newco.example",
                "support_phone": "+1 555 0100",
                "logo_url": "https://example.com/logo.png",
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["company_name"] == "New Co"
        assert body["support_email"] == "support@newco.example"
        assert local_state.organization_settings["company_name"] == "New Co"

        get_response = TestClient(app).get("/settings/organization")
        assert get_response.json()["company_name"] == "New Co"
    finally:
        app.dependency_overrides.clear()


def test_non_administrator_cannot_update_organization_settings(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    app.dependency_overrides[get_current_user] = _user(Role.MANAGER)
    try:
        response = TestClient(app).put(
            "/settings/organization",
            json={"company_name": "Blocked Co"},
        )
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_update_organization_settings_rejects_invalid_email(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    app.dependency_overrides[get_current_user] = _user(Role.ADMINISTRATOR)
    try:
        response = TestClient(app).put(
            "/settings/organization",
            json={"company_name": "Acme", "support_email": "not-an-email"},
        )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()


def test_production_update_organization_settings_persists_via_repository(monkeypatch) -> None:
    class FakeRepo:
        saved = {}

        def put_organization_settings(self, company_name, support_email, support_phone, logo_url, actor_sub, actor_email, actor_roles):
            FakeRepo.saved = {
                "company_name": company_name,
                "support_email": support_email,
                "support_phone": support_phone,
                "logo_url": logo_url,
                "actor_sub": actor_sub,
            }
            return {"company_name": company_name, "support_email": support_email, "support_phone": support_phone, "logo_url": logo_url}

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr("app.routers.settings.DynamoRepository", FakeRepo)
    app.dependency_overrides[get_current_user] = _user(Role.ADMINISTRATOR)
    try:
        response = TestClient(app).put(
            "/settings/organization",
            json={"company_name": "Prod Co"},
        )
        assert response.status_code == 200
        assert FakeRepo.saved["company_name"] == "Prod Co"
        assert FakeRepo.saved["actor_sub"] == "actor-1"
    finally:
        app.dependency_overrides.clear()
