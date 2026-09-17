from __future__ import annotations

from datetime import date
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import assert_sensitive_user_authorization, can_access_scope, require_capability
from app.models import CancelInterviewRequest, RescheduleInterviewRequest, ScheduleInterviewRequest, utc_now_iso
from app.permissions import Capability
from app.records import list_candidates_for_lookup, to_local_date, visible_records
from app.repository import ConflictError, DynamoRepository, SchedulePayload, parse_local_to_utc
from app.state import local_state

router = APIRouter(prefix="/interviews", tags=["interviews"])


@router.get("")
def list_interviews(
    user=CurrentUser,
    status_filter: str = Query(default="", alias="status"),
    requisition_id: str = Query(default=""),
    q: str = Query(default=""),
    mine_only: bool = Query(default=False),
    start_date: str = Query(default=""),
    end_date: str = Query(default=""),
    timezone_name: str = Query(alias="timezone", default="Asia/Kolkata"),
):
    require_capability(user, Capability.VIEW_INTERVIEWS)
    requisitions, interviews = visible_records(user)
    requisitions_by_id = {item["requisition_id"]: item for item in requisitions}
    candidates_by_id = {item["candidate_id"]: item for item in list_candidates_for_lookup()}
    needle = q.casefold().strip()
    range_start = date.fromisoformat(start_date) if start_date else None
    range_end = date.fromisoformat(end_date) if end_date else None
    rows = []
    for interview in interviews:
        if status_filter and interview.get("status") != status_filter:
            continue
        if requisition_id and interview.get("requisition_id") != requisition_id:
            continue
        if mine_only and user.sub not in interview.get("panel_subs", []):
            continue
        if (range_start or range_end) and interview.get("start_utc"):
            interview_date = to_local_date(interview["start_utc"], timezone_name)
            if range_start and interview_date < range_start:
                continue
            if range_end and interview_date > range_end:
                continue
        requisition = requisitions_by_id.get(interview.get("requisition_id", ""), {})
        candidate = candidates_by_id.get(interview.get("candidate_id", ""), {})
        row = {
            **interview,
            "requisition_title": requisition.get("title", ""),
            "client_name": requisition.get("client_name", ""),
            "candidate_name": candidate.get("full_name", ""),
        }
        if needle and needle not in f"{row['candidate_name']} {row['requisition_title']} {row.get('requisition_id', '')}".casefold():
            continue
        rows.append(row)
    rows.sort(key=lambda item: item.get("start_utc", ""), reverse=True)
    return {"interviews": rows}


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
        local_state.audit.append(
            {
                "entity": "interview",
                "action": "scheduled",
                "entity_id": interview.interview_id,
                "actor_sub": user.sub,
                "actor_email": user.email or "",
                "actor_roles": sorted(role.value for role in user.groups),
                "at": utc_now_iso(),
            }
        )
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
        actor_email=user.email or "",
        actor_roles=sorted(role.value for role in user.groups),
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
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
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
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


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
