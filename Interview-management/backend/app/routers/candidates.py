from __future__ import annotations

from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_capability
from app.models import CandidateStatusUpdateRequest, CandidateUpsertRequest, utc_now_iso
from app.permissions import Capability
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.post("", status_code=201)
def create_candidate(payload: CandidateUpsertRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_CANDIDATES)
    candidate_id = str(uuid4())
    record = payload.model_dump()
    record["candidate_id"] = candidate_id
    record["status"] = "Active"
    record["created_at"] = utc_now_iso()
    record["created_by"] = user.sub
    if settings.demo_mode:
        # Lightweight duplicate signal for TA review.
        duplicate = next(
            (c for c in local_state.candidates.values() if c["email"].lower() == payload.email.lower() or c["phone"] == payload.phone),
            None,
        )
        record["duplicate_candidate_id"] = duplicate["candidate_id"] if duplicate else None
        local_state.candidates[candidate_id] = record
        local_state.audit.append({"entity": "candidate", "action": "created", "entity_id": candidate_id, "actor": user.sub})
        return record
    repo = DynamoRepository()
    repo.put_candidate(candidate_id, record, user.sub)
    return record


@router.get("")
def list_candidates(
    user=CurrentUser,
    q: str = "",
    candidate_type: str = "",
    lifecycle: Literal["active", "closed", "all"] = "active",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    if settings.demo_mode:
        records = list(local_state.candidates.values())
    else:
        records = DynamoRepository().list_candidates()
    needle = q.casefold().strip()
    results = [
        record
        for record in records
        if (not candidate_type or record.get("candidate_type") == candidate_type)
        and (
            lifecycle == "all"
            or (lifecycle == "closed" and record.get("status", "Active") == "Closed")
            or (lifecycle == "active" and record.get("status", "Active") != "Closed")
        )
        and (not needle or needle in f"{record.get('full_name', '')} {record.get('email', '')}".casefold())
    ]
    results.sort(key=lambda item: item.get("full_name", ""))
    total = len(results)
    start = (page - 1) * page_size
    return {"candidates": results[start : start + page_size], "page": page, "page_size": page_size, "total": total}


@router.post("/{candidate_id}/status")
def update_candidate_status(candidate_id: str, payload: CandidateStatusUpdateRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_CANDIDATES)
    status_value = payload.status.value
    if settings.demo_mode:
        record = local_state.candidates.get(candidate_id)
        if not record:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
        record["status"] = status_value
        record["updated_at"] = utc_now_iso()
        record["updated_by"] = user.sub
        return record
    try:
        DynamoRepository().update_candidate_status(
            candidate_id,
            status_value,
            user.sub,
            user.email or "",
            sorted(role.value for role in user.groups),
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found") from exc
    return {"candidate_id": candidate_id, "status": status_value, "updated_by": user.sub}


@router.get("/{candidate_id}")
def get_candidate(candidate_id: str, user=CurrentUser):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    if settings.demo_mode:
        candidate = local_state.candidates.get(candidate_id)
        if not candidate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
        return candidate
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Direct candidate read from DynamoDB is omitted in this scaffold")

