from fastapi import APIRouter

from app.auth import CurrentUser
from app.deps import require_capability
from app.permissions import Capability
from app.state import local_state

router = APIRouter(prefix="/availability", tags=["availability"])


@router.post("/me")
def set_availability(slots: list[dict], user=CurrentUser):
    require_capability(user, Capability.MANAGE_AVAILABILITY)
    profile = local_state.users.setdefault(user.sub, {"sub": user.sub, "groups": [], "status": "ACTIVE", "authz_version": 1})
    profile["availability"] = slots
    return {"sub": user.sub, "availability": slots}


@router.get("/me")
def get_availability(user=CurrentUser):
    require_capability(user, Capability.MANAGE_AVAILABILITY)
    return {"sub": user.sub, "availability": local_state.users.get(user.sub, {}).get("availability", [])}

