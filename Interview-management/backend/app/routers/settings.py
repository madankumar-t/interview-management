from __future__ import annotations

from fastapi import APIRouter

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_capability
from app.models import OrganizationSettingsUpdateRequest, utc_now_iso
from app.permissions import Capability
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/organization")
def get_organization_settings(user=CurrentUser):
    if settings.demo_mode:
        return local_state.organization_settings
    repo = DynamoRepository()
    return repo.get_organization_settings() or {
        "company_name": "Interview Management",
        "support_email": None,
        "support_phone": None,
        "logo_url": None,
        "updated_at": None,
        "updated_by": None,
    }


@router.put("/organization")
def update_organization_settings(payload: OrganizationSettingsUpdateRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_SETTINGS)
    if settings.demo_mode:
        local_state.organization_settings = {
            "company_name": payload.company_name,
            "support_email": payload.support_email,
            "support_phone": payload.support_phone,
            "logo_url": payload.logo_url,
            "updated_at": utc_now_iso(),
            "updated_by": user.sub,
        }
        local_state.audit.append(
            {
                "entity": "settings",
                "entity_id": "organization",
                "action": "updated",
                "actor": user.sub,
                "at": local_state.organization_settings["updated_at"],
            }
        )
        return local_state.organization_settings
    repo = DynamoRepository()
    return repo.put_organization_settings(
        payload.company_name,
        payload.support_email,
        payload.support_phone,
        payload.logo_url,
        user.sub,
        user.email or "",
        sorted(role.value for role in user.groups),
    )
