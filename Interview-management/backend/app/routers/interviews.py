from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import assert_sensitive_user_authorization, can_access_scope, require_capability
from app.models import CancelInterviewRequest, RescheduleInterviewRequest, ScheduleInterviewRequest, utc_now_iso
from app.permissions import Capability
from app.repository import ConflictError, DynamoRepository, SchedulePayload, parse_local_to_utc
from app.state import local_state

router = APIRouter(prefix="/interviews", tags=["interviews"])


@router.post("", status_code=201)
def schedule_interview(payload: ScheduleInterviewRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_SCHEDULING)
    assert_sensitive_user_authorization(user)
    if settings.demo_mode:
        req = local_state.requisitions.get(payload.requisition_id)
        if not req:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisition not found")
        interview = local_state.scheduling_service.schedule(
            {
                **payload.model_dump(),
                "department": req["department"],
                "project": req["project"],
            }
        )
        local_state.audit.append({"entity": "interview", "action": "scheduled", "entity_id": interview.interview_id, "actor": user.sub})
        return interview.__dict__
    repo = DynamoRepository()
    department, project = repo.get_requisition_scope(payload.requisition_id)
    start_utc = parse_local_to_utc(payload.start_local_iso, payload.timezone).isoformat()
    end_utc = parse_local_to_utc(payload.end_local_iso, payload.timezone).isoformat()
    schedule_payload = SchedulePayload(
        interview_id=str(uuid4()),
        candidate_id=payload.candidate_id,
        requisition_id=payload.requisition_id,
        department=department,
        project=project,
        panel_subs=payload.panel_subs,
        lead_panel_sub=payload.lead_panel_sub,
        start_utc=start_utc,
        end_utc=end_utc,
        timezone=payload.timezone,
        round_name=payload.round_name,
        interview_type=payload.interview_type,
        mode=payload.mode,
        meeting_url=payload.meeting_url,
        venue=payload.venue,
        instructions=payload.instructions,
        required_skills=payload.required_skills,
        actor_sub=user.sub,
        idempotency_key=payload.idempotency_key,
    )
    try:
        return repo.schedule_interview(schedule_payload)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.get("/{interview_id}")
def get_interview(interview_id: str, user=CurrentUser):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    if settings.demo_mode:
        interview = local_state.scheduling_store.get(interview_id)
        if not interview:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
        if not can_access_scope(user, interview.department, interview.project, set(interview.panel_subs)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return interview.__dict__
    repo = DynamoRepository()
    record = repo.get_interview(interview_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    if not can_access_scope(user, record["department"], record["project"], set(record["panel_subs"])):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return record


@router.post("/{interview_id}/reschedule")
def reschedule_interview(interview_id: str, payload: RescheduleInterviewRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_SCHEDULING)
    assert_sensitive_user_authorization(user)
    if settings.demo_mode:
        current = local_state.scheduling_store.get(interview_id)
        if not current:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
        if not can_access_scope(user, current.department, current.project, set(current.panel_subs)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        try:
            interview = local_state.scheduling_service.reschedule(interview_id, payload.model_dump())
            return interview.__dict__
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    repo = DynamoRepository()
    try:
        start_utc = parse_local_to_utc(payload.start_local_iso, payload.timezone).isoformat()
        end_utc = parse_local_to_utc(payload.end_local_iso, payload.timezone).isoformat()
        return repo.reschedule_interview(
            interview_id=interview_id,
            start_utc=start_utc,
            end_utc=end_utc,
            timezone_name=payload.timezone,
            reason=payload.reason,
            actor_sub=user.sub,
            expected_version=payload.expected_version,
            idempotency_key=payload.idempotency_key,
        )
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/{interview_id}/cancel")
def cancel_interview(interview_id: str, payload: CancelInterviewRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_SCHEDULING)
    assert_sensitive_user_authorization(user)
    if settings.demo_mode:
        current = local_state.scheduling_store.get(interview_id)
        if not current:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
        if not can_access_scope(user, current.department, current.project, set(current.panel_subs)):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        current.status = "Cancelled"
        current.version += 1
        current.history.append({"action": "cancelled", "reason": payload.reason, "at": utc_now_iso()})
        return current.__dict__
    repo = DynamoRepository()
    try:
        return repo.cancel_interview(interview_id, payload.reason, user.sub, payload.expected_version, payload.idempotency_key)
    except ConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
