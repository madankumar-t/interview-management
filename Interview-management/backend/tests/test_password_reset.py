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


def test_manager_can_request_user_password_reset_in_demo_mode(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(
        local_state,
        "users",
        {
            "target-1": {
                "sub": "target-1",
                "email": "target@example.com",
                "groups": ["Panel"],
                "status": "ACTIVE",
                "authz_version": 1,
            }
        },
    )
    app.dependency_overrides[get_current_user] = _user(Role.MANAGER)
    try:
        response = TestClient(app).post("/admin/users/target-1/reset-password")
        assert response.status_code == 200
        assert response.json()["message"] == "Password reset requested"

        local_state.users["target-1"]["status"] = "DISABLED"
        blocked = TestClient(app).post("/admin/users/target-1/reset-password")
        assert blocked.status_code == 409
    finally:
        app.dependency_overrides.clear()


def test_panel_cannot_request_another_users_password_reset(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    app.dependency_overrides[get_current_user] = _user(Role.PANEL)
    try:
        response = TestClient(app).post("/admin/users/target-1/reset-password")
        assert response.status_code == 403
    finally:
        app.dependency_overrides.clear()


def test_production_reset_targets_username_and_blocks_disabled_user(monkeypatch) -> None:
    class FakeCognito:
        reset_username = ""
        enabled = True

        def list_users(self):
            return [
                {
                    "sub": "target-1",
                    "username": "target@example.com",
                    "email": "target@example.com",
                    "enabled": self.enabled,
                    "groups": ["Panel"],
                }
            ]

        def reset_user_password(self, username):
            FakeCognito.reset_username = username

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr("app.routers.admin.CognitoAdmin", FakeCognito)
    app.dependency_overrides[get_current_user] = _user(Role.ADMINISTRATOR)
    try:
        client = TestClient(app)
        response = client.post("/admin/users/target-1/reset-password")
        assert response.status_code == 200
        assert FakeCognito.reset_username == "target@example.com"

        FakeCognito.enabled = False
        blocked = client.post("/admin/users/target-1/reset-password")
        assert blocked.status_code == 409
    finally:
        app.dependency_overrides.clear()


def test_production_reset_blocks_federated_user(monkeypatch) -> None:
    class FakeCognito:
        def list_users(self):
            return [
                {
                    "sub": "target-1",
                    "username": "target@example.com",
                    "email": "target@example.com",
                    "enabled": True,
                    "cognito_status": "EXTERNAL_PROVIDER",
                    "groups": ["Panel"],
                }
            ]

        def reset_user_password(self, username):
            raise AssertionError(f"reset_user_password should not be called for {username}")

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr("app.routers.admin.CognitoAdmin", FakeCognito)
    app.dependency_overrides[get_current_user] = _user(Role.ADMINISTRATOR)
    try:
        response = TestClient(app).post("/admin/users/target-1/reset-password")
        assert response.status_code == 409
        assert response.json()["detail"] == "Federated sign-in users must reset their password with their identity provider"
    finally:
        app.dependency_overrides.clear()
