from fastapi import HTTPException

from app.deps import assert_sensitive_user_authorization
from app.models import AuthContext, Role
from app.state import local_state


def test_disabled_user_blocked(monkeypatch) -> None:
    from app import config

    monkeypatch.setattr(config.settings, "demo_mode", True)
    user = AuthContext(sub="demo-ta-1", groups={Role.TA}, token_use="access", authz_version=1)
    local_state.users["demo-ta-1"]["status"] = "DISABLED"
    try:
        assert_sensitive_user_authorization(user)
        assert False, "Expected forbidden"
    except HTTPException as exc:
        assert exc.status_code == 403
    finally:
        local_state.users["demo-ta-1"]["status"] = "ACTIVE"

