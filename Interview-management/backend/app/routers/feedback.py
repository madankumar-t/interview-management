from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import can_access_scope, require_capability
from app.models import FeedbackSubmitRequest, FeedbackUpsertRequest, utc_now_iso
from app.permissions import Capability
from app.state import local_state

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("/draft", status_code=201)
def save_draft(payload: FeedbackUpsertRequest, user=CurrentUser):
    require_capability(user, Capability.SUBMIT_FEEDBACK)
    interview = local_state.scheduling_store.get(payload.interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    if user.sub not in interview.panel_subs:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only assigned panel can save feedback")
    key = f"{payload.interview_id}::{user.sub}"
    prior = local_state.feedback.get(key)
    if prior and prior["status"] == "Submitted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Submitted feedback is locked")
    local_state.feedback[key] = {
        **payload.model_dump(),
        "author_sub": user.sub,
        "status": "Draft",
        "updated_at": utc_now_iso(),
    }
    return local_state.feedback[key]


@router.post("/submit")
def submit_feedback(payload: FeedbackSubmitRequest, user=CurrentUser):
    require_capability(user, Capability.SUBMIT_FEEDBACK)
    key = f"{payload.interview_id}::{user.sub}"
    draft = local_state.feedback.get(key)
    if not draft:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found")
    if draft["status"] == "Submitted":
        return draft
    draft["status"] = "Submitted"
    draft["submitted_at"] = utc_now_iso()
    local_state.audit.append({"entity": "feedback", "entity_id": key, "action": "submitted", "actor": user.sub})
    return draft


@router.get("/interview/{interview_id}")
def list_feedback(interview_id: str, user=CurrentUser):
    interview = local_state.scheduling_store.get(interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    if not can_access_scope(user, interview.department, interview.project, set(interview.panel_subs)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    records = [f for f in local_state.feedback.values() if f["interview_id"] == interview_id]
    if settings.demo_mode and user.sub in interview.panel_subs:
        # Draft feedback remains private to author.
        records = [f for f in records if f["status"] == "Submitted" or f["author_sub"] == user.sub]
    return records

