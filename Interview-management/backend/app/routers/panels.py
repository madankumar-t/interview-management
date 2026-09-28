from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status

from app.auth import CurrentUser
from app.availability_service import get_user_availability, unavailable_panel_subs
from app.config import settings
from app.deps import require_capability
from app.identity import CognitoAdmin
from app.models import INTERVIEW_ACTIVE_STATUSES, PanelCreateRequest, PanelStatusUpdateRequest, utc_now_iso
from app.permissions import Capability
from app.records import reporting_records, resolve_timezone, visible_records
from app.repository import DynamoRepository, slot_keys
from app.state import local_state

router = APIRouter(prefix="/panels", tags=["panels"])


@router.post("", status_code=201)
def create_panel(payload: PanelCreateRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_SCHEDULING)
    panel_id = str(uuid4())
    login_sub = ""
    if payload.panel_type.value == "Internal" and not settings.demo_mode:
        login_user = next(
            (
                record
                for record in CognitoAdmin().list_users()
                if record.get("email", "").casefold() == payload.email.casefold()
                and "Panel" in record.get("groups", [])
                and record.get("enabled", True)
            ),
            None,
        )
        if not login_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Internal panel email must belong to an active user with the Panel role",
            )
        login_sub = login_user["sub"]
    record = {
        "panel_id": panel_id,
        "sub": login_sub or panel_id,
        "login_sub": login_sub,
        **payload.model_dump(mode="json"),
        "skills": payload.technologies,
        "status": "Active",
        "availability_slots": 0,
        "created_at": utc_now_iso(),
    }
    if settings.demo_mode:
        local_state.users[panel_id] = {**record, "groups": ["Panel"]}
        return record
    DynamoRepository().put_panel(
        panel_id,
        {**payload.model_dump(mode="json"), "login_sub": login_sub},
        user.sub,
        user.email or "",
        sorted(role.value for role in user.groups),
    )
    return record


@router.get("/members")
def list_panel_members(
    user=CurrentUser,
    q: str = "",
    technology: str = "",
    panel_type: str = "",
    include_inactive: bool = False,
):
    require_capability(user, Capability.ASSIGN_INTERVIEWS)
    if settings.demo_mode:
        records = [
            {
                **profile,
                "full_name": profile.get("full_name", ""),
                "email": profile.get("email") or profile["sub"],
                "skills": profile.get("skills", profile.get("technologies", [])),
                "panel_type": profile.get("panel_type", "Internal"),
                "experience_years": profile.get("experience_years", 0),
                "availability_slots": len(profile.get("availability", [])),
            }
            for profile in local_state.users.values()
            if "Panel" in profile.get("groups", [])
        ]
    else:
        repo = DynamoRepository()
        records = repo.list_panels()
        unlinked_emails = {record.get("email", "").casefold() for record in records if not record.get("login_sub")}
        if unlinked_emails:
            logins = {
                record.get("email", "").casefold(): record["sub"]
                for record in CognitoAdmin().list_users()
                if record.get("email", "").casefold() in unlinked_emails
                and "Panel" in record.get("groups", [])
                and record.get("enabled", True)
            }
            for record in records:
                login_sub = logins.get(record.get("email", "").casefold()) if not record.get("login_sub") else None
                if login_sub:
                    record["sub"] = login_sub
                    record["login_sub"] = login_sub
                    record["availability_slots"] = len(repo.get_availability(login_sub))
    needle = q.casefold().strip()
    results = [
        record for record in records
        if (include_inactive or record.get("status", "Active") in {"Active", "ACTIVE"})
        and (not panel_type or record.get("panel_type") == panel_type)
        and (not technology or technology.casefold() in {skill.casefold() for skill in record.get("skills", [])})
        and (not needle or needle in f"{record.get('full_name', '')} {record.get('email', '')}".casefold())
    ]
    results.sort(key=lambda record: (record.get("full_name") or record.get("email", "")).casefold())
    return {"panel_members": results}


@router.post("/{panel_id}/status")
def update_panel_status(panel_id: str, payload: PanelStatusUpdateRequest, user=CurrentUser):
    require_capability(user, Capability.MANAGE_SCHEDULING)
    status_value = payload.status.value
    if settings.demo_mode:
        record = local_state.users.get(panel_id)
        if not record or "Panel" not in record.get("groups", []):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Panel not found")
        record["status"] = status_value
        return record
    try:
        DynamoRepository().update_panel_status(
            panel_id, status_value, user.sub, user.email or "", sorted(role.value for role in user.groups)
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Panel not found") from exc
    return {"sub": panel_id, "status": status_value}


@router.get("/available-slots")
def available_slots(
    user=CurrentUser,
    panel_subs: str = Query(...),
    date_value: str = Query(..., alias="date"),
    timezone_name: str = Query(..., alias="timezone"),
    duration_minutes: int = Query(..., ge=15, le=480),
    candidate_id: str = "",
):
    require_capability(user, Capability.ASSIGN_INTERVIEWS)
    subs = {value for value in panel_subs.split(",") if value}
    if not subs or len(subs) > 20:
        raise HTTPException(status_code=422, detail="Select between 1 and 20 panel members")
    try:
        day = date.fromisoformat(date_value)
        tz = resolve_timezone(timezone_name)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Invalid date or timezone") from exc
    start = datetime.combine(day, time.min, tzinfo=tz).astimezone(timezone.utc)
    end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz).astimezone(timezone.utc)
    duration = timedelta(minutes=duration_minutes)
    availability = {
        sub: [(datetime.fromisoformat(slot["start_utc"]), datetime.fromisoformat(slot["end_utc"]))
              for slot in get_user_availability(sub)]
        for sub in subs
    }
    _, interviews = reporting_records()
    buffer = timedelta(minutes=settings.reservation_buffer_minutes)
    bookings = [
        set(slot_keys(datetime.fromisoformat(item["start_utc"]) - buffer,
                      datetime.fromisoformat(item["end_utc"]) + buffer))
        for item in interviews
        if item.get("status") in INTERVIEW_ACTIVE_STATUSES
        and (subs.intersection(item.get("panel_subs", [])) or (candidate_id and item.get("candidate_id") == candidate_id))
    ]
    booked_slots = set().union(*bookings)
    slots = []
    current = start
    while current + duration < end:
        finish = current + duration
        if (current > datetime.now(timezone.utc)
                and all(any(window_start <= current and finish <= window_end for window_start, window_end in windows)
                        for windows in availability.values())
                and not booked_slots.intersection(slot_keys(current - buffer, finish + buffer))):
            slots.append({"start_utc": current.isoformat(), "end_utc": finish.isoformat()})
        current += timedelta(minutes=15)
    return {"slots": slots}


@router.get("/conflicts")
def check_conflicts(
    user=CurrentUser,
    panel_subs: str = Query(default=""),
    start_utc: str = Query(...),
    end_utc: str = Query(...),
    candidate_id: str = "",
):
    require_capability(user, Capability.ASSIGN_INTERVIEWS)
    subs = {value for value in panel_subs.split(",") if value}
    new_start = datetime.fromisoformat(start_utc)
    new_end = datetime.fromisoformat(end_utc)
    _, interviews = visible_records(user)
    conflicts = []
    for interview in interviews:
        if interview.get("status") not in INTERVIEW_ACTIVE_STATUSES:
            continue
        overlap_subs = subs.intersection(interview.get("panel_subs", []))
        candidate_overlap = bool(candidate_id and interview.get("candidate_id") == candidate_id)
        if not overlap_subs and not candidate_overlap:
            continue
        existing_start = datetime.fromisoformat(interview["start_utc"])
        existing_end = datetime.fromisoformat(interview["end_utc"])
        buffer = timedelta(minutes=settings.reservation_buffer_minutes)
        if set(slot_keys(new_start - buffer, new_end + buffer)) & set(slot_keys(existing_start - buffer, existing_end + buffer)):
            conflicts.append(
                {
                    "panel_subs": sorted(overlap_subs),
                    "candidate_overlap": candidate_overlap,
                    "interview_id": interview["interview_id"],
                    "start_utc": interview["start_utc"],
                    "end_utc": interview["end_utc"],
                }
            )
    unavailable = unavailable_panel_subs(subs, start_utc, end_utc)
    return {"conflicts": conflicts, "unavailable_panel_subs": unavailable}
