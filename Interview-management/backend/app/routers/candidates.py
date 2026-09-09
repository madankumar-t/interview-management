from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_capability
from app.models import CandidateUpsertRequest, utc_now_iso
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


@router.get("/{candidate_id}")
def get_candidate(candidate_id: str, user=CurrentUser):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    if settings.demo_mode:
        candidate = local_state.candidates.get(candidate_id)
        if not candidate:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
        return candidate
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Direct candidate read from DynamoDB is omitted in this scaffold")

