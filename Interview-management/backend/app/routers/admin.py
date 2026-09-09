from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.deps import require_admin
from app.models import utc_now_iso
from app.state import local_state

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
def list_users(user=CurrentUser):
    require_admin(user)
    return list(local_state.users.values())


@router.post("/users/{user_sub}/disable")
def disable_user(user_sub: str, user=CurrentUser):
    require_admin(user)
    target = local_state.users.get(user_sub)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    admins = [u for u in local_state.users.values() if "Administrator" in u["groups"] and u["status"] == "ACTIVE"]
    if "Administrator" in target["groups"] and len(admins) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot disable last active administrator")
    target["status"] = "DISABLED"
    target["authz_version"] = int(target["authz_version"]) + 1
    local_state.audit.append({"entity": "user", "entity_id": user_sub, "action": "disabled", "actor": user.sub, "at": utc_now_iso()})
    return target


@router.post("/users/{user_sub}/groups")
def set_groups(user_sub: str, groups: list[str], user=CurrentUser):
    require_admin(user)
    target = local_state.users.get(user_sub)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    admins = [u for u in local_state.users.values() if "Administrator" in u["groups"] and u["status"] == "ACTIVE"]
    if "Administrator" in target["groups"] and "Administrator" not in groups and len(admins) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot remove last active administrator")
    target["groups"] = groups
    target["authz_version"] = int(target["authz_version"]) + 1
    local_state.audit.append({"entity": "user", "entity_id": user_sub, "action": "groups_updated", "actor": user.sub, "at": utc_now_iso()})
    return target

