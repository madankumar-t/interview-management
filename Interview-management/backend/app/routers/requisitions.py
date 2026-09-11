from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_capability
from app.models import RequisitionStatusUpdateRequest, RequisitionUpsertRequest, utc_now_iso
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


@router.get("")
def list_requisitions(
    user=CurrentUser,
    q: str = "",
    status: str = "",
    open_only: bool = False,
    lifecycle: Literal["active", "closed", "all"] = "active",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    if settings.demo_mode:
        records = list(local_state.requisitions.values())
    else:
        records = DynamoRepository().list_requisitions()
    needle = q.casefold().strip()
    results = [
        record
        for record in records
        if (not status or record.get("status") == status)
        and (
            lifecycle == "all"
            or (lifecycle == "closed" and record.get("status") in {"Filled", "Cancelled", "Closed"})
            or (lifecycle == "active" and record.get("status") not in {"Filled", "Cancelled", "Closed"})
        )
        and (not open_only or int(record.get("positions_open", 0)) > 0)
        and (
            not needle
            or needle in f"{record.get('title', '')} {record.get('requisition_id', '')} {record.get('client_name', '')}".casefold()
        )
    ]
    results.sort(key=lambda item: item.get("requisition_id", ""))
    total = len(results)
    start = (page - 1) * page_size
    return {"requisitions": results[start : start + page_size], "page": page, "page_size": page_size, "total": total}


@router.post("/{requisition_id}/status")
def update_requisition_status(requisition_id: str, payload: RequisitionStatusUpdateRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_CANDIDATES)
    status_value = payload.status.value
    if settings.demo_mode:
        record = local_state.requisitions.get(requisition_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisition not found")
        record["status"] = status_value
        record["updated_at"] = utc_now_iso()
        record["updated_by"] = user.sub
        local_state.audit.append(
            {
                "entity": "requisition",
                "action": "status_updated",
                "entity_id": requisition_id,
                "actor": user.sub,
                "actor_email": user.email or "",
                "actor_roles": sorted(role.value for role in user.groups),
                "changes": f"status={status_value}",
            }
        )
        return record
    repo = DynamoRepository()
    try:
        repo.update_requisition_status(
            requisition_id,
            status_value,
            user.sub,
            user.email or "",
            sorted(role.value for role in user.groups),
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisition not found") from exc
    return {"requisition_id": requisition_id, "status": status_value, "updated_by": user.sub}


@router.get("/{requisition_id}")
def get_requisition(requisition_id: str, user=CurrentUser):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    if settings.demo_mode:
        record = local_state.requisitions.get(requisition_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisition not found")
        return record
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Direct requisition read from DynamoDB is omitted in this scaffold")
