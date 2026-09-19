from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_user_management
from app.identity import CognitoAdmin, CognitoAdminError
from app.models import AdminCreateUserRequest, AdminUpdateGroupsRequest, utc_now_iso
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/admin", tags=["admin"])


def _is_active(record: dict) -> bool:
    return record.get("status", "ACTIVE" if record.get("enabled", True) else "DISABLED") == "ACTIVE"


def _count_active_admins(users: list[dict]) -> int:
    return sum(1 for u in users if "Administrator" in u.get("groups", []) and _is_active(u))


def _password_reset_block_reason(record: dict) -> str | None:
    if not _is_active(record):
        return "Cannot reset password for a disabled user"
    if record.get("cognito_status") == "EXTERNAL_PROVIDER":
        return "Federated sign-in users must reset their password with their identity provider"
    if not record.get("email_verified") and not record.get("phone_number_verified"):
        return "Cognito requires a verified email address or phone number before it can send reset instructions"
    return None


@router.get("/users")
def list_users(user=CurrentUser):
    require_user_management(user)
    if settings.demo_mode:
        return list(local_state.users.values())
    cognito = CognitoAdmin()
    repo = DynamoRepository()
    users = cognito.list_users()
    for record in users:
        profile = repo.get_user_profile(record["sub"]) if record["sub"] else None
        record["status"] = "ACTIVE" if record["enabled"] else "DISABLED"
        record["authz_version"] = profile["authz_version"] if profile else 0
        record["password_reset_block_reason"] = _password_reset_block_reason(record)
        record["password_reset_allowed"] = record["password_reset_block_reason"] is None
    return users


@router.post("/users", status_code=201)
def create_user(payload: AdminCreateUserRequest, user=CurrentUser):
    require_user_management(user)
    if settings.demo_mode:
        sub = f"demo-user-{len(local_state.users) + 1}"
        record = {"sub": sub, "email": payload.email, "groups": payload.groups, "status": "ACTIVE", "authz_version": 1}
        local_state.users[sub] = record
        local_state.audit.append({"entity": "user", "entity_id": sub, "action": "created", "actor": user.sub, "at": utc_now_iso()})
        return record
    cognito = CognitoAdmin()
    try:
        created = cognito.create_user(payload.email, payload.full_name)
    except CognitoAdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    for group in payload.groups:
        cognito.add_to_group(created["username"], group)
    repo = DynamoRepository()
    repo.put_user_profile(created["sub"], payload.email, payload.groups, "ACTIVE", 1)
    local_state.audit.append({"entity": "user", "entity_id": created["sub"], "action": "created", "actor": user.sub, "at": utc_now_iso()})
    return {**created, "groups": payload.groups, "status": "ACTIVE", "authz_version": 1}


@router.post("/users/{user_sub}/disable")
def disable_user(user_sub: str, user=CurrentUser):
    require_user_management(user)
    if settings.demo_mode:
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
    cognito = CognitoAdmin()
    users = cognito.list_users()
    target = next((u for u in users if u["sub"] == user_sub), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if "Administrator" in target["groups"] and _count_active_admins(users) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot disable last active administrator")
    cognito.disable_user(target["username"])
    repo = DynamoRepository()
    repo.set_user_status(user_sub, "DISABLED")
    new_version = repo.bump_authz_version(user_sub)
    local_state.audit.append({"entity": "user", "entity_id": user_sub, "action": "disabled", "actor": user.sub, "at": utc_now_iso()})
    return {**target, "status": "DISABLED", "authz_version": new_version}


@router.post("/users/{user_sub}/enable")
def enable_user(user_sub: str, user=CurrentUser):
    require_user_management(user)
    if settings.demo_mode:
        target = local_state.users.get(user_sub)
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        target["status"] = "ACTIVE"
        local_state.audit.append({"entity": "user", "entity_id": user_sub, "action": "enabled", "actor": user.sub, "at": utc_now_iso()})
        return target
    cognito = CognitoAdmin()
    users = cognito.list_users()
    target = next((u for u in users if u["sub"] == user_sub), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    cognito.enable_user(target["username"])
    repo = DynamoRepository()
    repo.set_user_status(user_sub, "ACTIVE")
    local_state.audit.append({"entity": "user", "entity_id": user_sub, "action": "enabled", "actor": user.sub, "at": utc_now_iso()})
    return {"sub": user_sub, "status": "ACTIVE"}


@router.post("/users/{user_sub}/reset-password")
def reset_user_password(user_sub: str, user=CurrentUser):
    require_user_management(user)
    if settings.demo_mode:
        target = local_state.users.get(user_sub)
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if target.get("status") != "ACTIVE":
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot reset password for a disabled user")
        local_state.audit.append(
            {
                "entity": "user",
                "entity_id": user_sub,
                "action": "password_reset_requested",
                "actor": user.sub,
                "at": utc_now_iso(),
            }
        )
        return {"sub": user_sub, "message": "Password reset requested"}
    cognito = CognitoAdmin()
    target = next((record for record in cognito.list_users() if record["sub"] == user_sub), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    block_reason = _password_reset_block_reason(target)
    if block_reason:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=block_reason)
    try:
        cognito.reset_user_password(target["username"])
    except CognitoAdminError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    local_state.audit.append(
        {
            "entity": "user",
            "entity_id": user_sub,
            "action": "password_reset_requested",
            "actor": user.sub,
            "at": utc_now_iso(),
        }
    )
    return {"sub": user_sub, "message": "Password reset requested"}


@router.post("/users/{user_sub}/groups")
def set_groups(user_sub: str, payload: AdminUpdateGroupsRequest, user=CurrentUser):
    require_user_management(user)
    if settings.demo_mode:
        target = local_state.users.get(user_sub)
        if not target:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        admins = [u for u in local_state.users.values() if "Administrator" in u["groups"] and u["status"] == "ACTIVE"]
        if "Administrator" in target["groups"] and "Administrator" not in payload.groups and len(admins) <= 1:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot remove last active administrator")
        target["groups"] = payload.groups
        target["authz_version"] = int(target["authz_version"]) + 1
        local_state.audit.append({"entity": "user", "entity_id": user_sub, "action": "groups_updated", "actor": user.sub, "at": utc_now_iso()})
        return target
    cognito = CognitoAdmin()
    users = cognito.list_users()
    target = next((u for u in users if u["sub"] == user_sub), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if "Administrator" in target["groups"] and "Administrator" not in payload.groups and _count_active_admins(users) <= 1:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot remove last active administrator")
    cognito.set_groups(target["username"], payload.groups)
    repo = DynamoRepository()
    new_version = repo.bump_authz_version(user_sub)
    local_state.audit.append({"entity": "user", "entity_id": user_sub, "action": "groups_updated", "actor": user.sub, "at": utc_now_iso()})
    return {**target, "groups": payload.groups, "authz_version": new_version}
