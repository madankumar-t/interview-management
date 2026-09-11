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

