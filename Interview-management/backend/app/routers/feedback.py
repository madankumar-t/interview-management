from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import can_access_scope, require_capability
from app.models import FeedbackSubmitRequest, FeedbackUpsertRequest, utc_now_iso
from app.permissions import Capability
from app.repository import ConflictError, DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/feedback", tags=["feedback"])
FEEDBACK_ELIGIBLE_STATUSES = {"Scheduled", "Completed"}


def require_feedback_access(interview, user, demo_mode: bool) -> None:
    panel_subs = interview.panel_subs if demo_mode else interview["panel_subs"]
    interview_status = interview.status if demo_mode else interview["status"]
    department = interview.department if demo_mode else interview["department"]
    project = interview.project if demo_mode else interview["project"]
    if not can_access_scope(user, department, project, set(panel_subs)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to provide feedback")
    if interview_status not in FEEDBACK_ELIGIBLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Feedback is only available for scheduled or completed interviews",
        )


@router.post("/draft", status_code=201)
def save_draft(payload: FeedbackUpsertRequest, user=CurrentUser):
    require_capability(user, Capability.SUBMIT_FEEDBACK)
    if not settings.demo_mode:
        repo = DynamoRepository()
        interview = repo.get_interview(payload.interview_id)
        if not interview:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
        require_feedback_access(interview, user, demo_mode=False)
        try:
            return repo.put_feedback_draft(payload.interview_id, user.sub, payload.model_dump())
        except ConflictError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    interview = local_state.scheduling_store.get(payload.interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    require_feedback_access(interview, user, demo_mode=True)
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
    if not settings.demo_mode:
        repo = DynamoRepository()
        interview = repo.get_interview(payload.interview_id)
        if not interview:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
        require_feedback_access(interview, user, demo_mode=False)
        try:
            return repo.submit_feedback(
                payload.interview_id,
                user.sub,
                user.email or "",
                sorted(role.value for role in user.groups),
            )
        except KeyError as exc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found") from exc
        except ConflictError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    interview = local_state.scheduling_store.get(payload.interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    require_feedback_access(interview, user, demo_mode=True)
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
    repo = None if settings.demo_mode else DynamoRepository()
    interview = local_state.scheduling_store.get(interview_id) if settings.demo_mode else repo.get_interview(interview_id)
    if not interview:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    department = interview.department if settings.demo_mode else interview["department"]
    project = interview.project if settings.demo_mode else interview["project"]
    panel_subs = interview.panel_subs if settings.demo_mode else interview["panel_subs"]
    if not can_access_scope(user, department, project, set(panel_subs)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    records = (
        [f for f in local_state.feedback.values() if f["interview_id"] == interview_id]
        if settings.demo_mode
        else repo.list_feedback(interview_id)
    )
    if user.sub in panel_subs:
        # Draft feedback remains private to author.
        records = [f for f in records if f["status"] == "Submitted" or f["author_sub"] == user.sub]
    return records
