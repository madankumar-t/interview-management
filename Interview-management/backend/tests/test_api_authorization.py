from fastapi.testclient import TestClient

from app.main import app
from app.models import AuthContext, Role
from app.auth import get_current_user
from app import config


def _override(user: AuthContext):
    async def dep():
        return user

    return dep


def test_only_admin_can_change_groups(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="demo-ta-1", groups={Role.TA}, token_use="access", authz_version=1)
    )
    client = TestClient(app)
    response = client.post("/admin/users/demo-panel-1/groups", json={"groups": ["Panel"]})
    assert response.status_code == 403
    app.dependency_overrides.clear()


def test_manager_can_update_interview_status(monkeypatch) -> None:
    class FakeAuthRepository:
        def ensure_active_authorization(self, _sub, _authz_version, sensitive=False):
            assert sensitive is True

    class FakeInterviewRepository:
        def update_interview_status(self, interview_id, status_value, reason, actor_sub, expected_version):
            assert interview_id == "i-1"
            assert status_value == "L1 Completed"
            assert reason == "Round cleared"
            assert actor_sub == "manager-1"
            assert expected_version == 2
            return {"interview_id": interview_id, "status": status_value, "version": 3}

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr("app.deps.DynamoRepository", FakeAuthRepository)
    monkeypatch.setattr("app.routers.interviews.DynamoRepository", FakeInterviewRepository)
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="manager-1", groups={Role.MANAGER}, token_use="access", authz_version=1)
    )
    client = TestClient(app)
    response = client.post(
        "/interviews/i-1/status",
        json={"status": "L1 Completed", "reason": "Round cleared", "expected_version": 2},
    )

    assert response.status_code == 200
    assert response.json() == {"interview_id": "i-1", "status": "L1 Completed", "version": 3}
    app.dependency_overrides.clear()
