from __future__ import annotations

from fastapi import HTTPException, status

from app.config import settings
from app.models import AuthContext, Role
from app.permissions import Capability, ScopeContext, can_access_interview_record, has_capability
from app.repository import AuthorizationStateError, DynamoRepository
from app.state import local_state


def require_capability(user: AuthContext, capability: Capability) -> None:
    if not has_capability(user, capability):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


def assert_sensitive_user_authorization(user: AuthContext) -> None:
    if settings.demo_mode:
        profile = local_state.users.get(user.sub)
        if not profile or profile["status"] != "ACTIVE" or int(profile["authz_version"]) != user.authz_version:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Stale or disabled account")
        return
    repo = DynamoRepository()
    try:
        repo.ensure_active_authorization(user.sub, user.authz_version, sensitive=True)
    except AuthorizationStateError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


def manager_scopes_for(user: AuthContext) -> set[str]:
    if settings.demo_mode:
        return local_state.manager_scopes.get(user.sub, set())
    return DynamoRepository().get_manager_scopes(user.sub)


def can_access_scope(user: AuthContext, department: str, project: str, panel_subs: set[str]) -> bool:
    return can_access_interview_record(
        user,
        ScopeContext(
            department=department,
            project=project,
            panel_subs=panel_subs,
            manager_scopes=manager_scopes_for(user),
            actor_sub=user.sub,
        ),
    )


def require_admin(user: AuthContext) -> None:
    if Role.ADMINISTRATOR not in user.groups:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator role required")

