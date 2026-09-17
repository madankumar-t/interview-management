from fastapi import APIRouter

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_capability
from app.models import AvailabilityUpdateRequest
from app.permissions import Capability
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/availability", tags=["availability"])


@router.put("/me")
def set_availability(payload: AvailabilityUpdateRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_AVAILABILITY)
    slots = [slot.model_dump(mode="json") for slot in payload.slots]
    if settings.demo_mode:
        profile = local_state.users.setdefault(
            user.sub,
            {"sub": user.sub, "groups": [], "status": "ACTIVE", "authz_version": 1},
        )
        profile["availability"] = slots
    else:
        DynamoRepository().put_availability(
            user.sub,
            slots,
            user.email or "",
            sorted(role.value for role in user.groups),
        )
    return {"sub": user.sub, "availability": slots}


@router.get("/me")
def get_availability(user=CurrentUser):
    require_capability(user, Capability.MANAGE_AVAILABILITY)
    slots = (
        local_state.users.get(user.sub, {}).get("availability", [])
        if settings.demo_mode
        else DynamoRepository().get_availability(user.sub)
    )
    return {"sub": user.sub, "availability": slots}
