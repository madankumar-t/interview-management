from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_capability
from app.models import RequisitionUpsertRequest, utc_now_iso
from app.permissions import Capability
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/requisitions", tags=["requisitions"])


@router.post("", status_code=201)
def upsert_requisition(payload: RequisitionUpsertRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_CANDIDATES)
    record = payload.model_dump(mode="json")
    record["positions_open"] = max(0, int(record["positions_total"]) - int(record["positions_filled"]))
    record["updated_at"] = utc_now_iso()
    record["updated_by"] = user.sub
    if settings.demo_mode:
        local_state.requisitions[payload.requisition_id] = record
        local_state.audit.append({"entity": "requisition", "action": "upserted", "entity_id": payload.requisition_id, "actor": user.sub})
        return record
    repo = DynamoRepository()
    repo.put_requisition(record, user.sub)
    return record


@router.get("/{requisition_id}")
def get_requisition(requisition_id: str, user=CurrentUser):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    if settings.demo_mode:
        record = local_state.requisitions.get(requisition_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisition not found")
        return record
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Direct requisition read from DynamoDB is omitted in this scaffold")
