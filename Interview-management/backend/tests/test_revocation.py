from fastapi import HTTPException
import pytest

from app.deps import assert_sensitive_user_authorization
from app.models import AuthContext, Role
from app.repository import AuthorizationStateError, DynamoRepository
from app.state import local_state


class FakeDynamoClient:
    def __init__(self, status: str, authz_version: int = 1):
        self.item = {
            "status": {"S": status},
            "authz_version": {"N": str(authz_version)},
        }

    def get_item(self, **_kwargs):
        return {"Item": self.item}


def repository_with_profile(status: str, authz_version: int = 1) -> DynamoRepository:
    repo = DynamoRepository.__new__(DynamoRepository)
    repo.client = FakeDynamoClient(status, authz_version)
    repo.table_name = "test-table"
    return repo


def test_active_user_without_version_claim_is_allowed() -> None:
    repository_with_profile("ACTIVE").ensure_active_authorization("user-1", None, sensitive=True)


def test_disabled_user_without_version_claim_is_blocked() -> None:
    with pytest.raises(AuthorizationStateError):
        repository_with_profile("DISABLED").ensure_active_authorization("user-1", None, sensitive=True)


def test_present_version_claim_must_match_profile() -> None:
    with pytest.raises(AuthorizationStateError):
        repository_with_profile("ACTIVE", authz_version=2).ensure_active_authorization("user-1", 1, sensitive=True)


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

