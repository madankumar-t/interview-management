from fastapi import APIRouter

from app.auth import CurrentUser
from app.deps import require_capability
from app.permissions import Capability
from app.state import local_state

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("")
def list_audit(user=CurrentUser):
    require_capability(user, Capability.VIEW_AUDIT)
    return local_state.audit[-200:]

