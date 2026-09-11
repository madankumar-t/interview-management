from __future__ import annotations

from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import settings
from app.deps import manager_scopes_for
from app.models import Role
from app.repository import DynamoRepository
from app.state import local_state

CLOSED_REQUIREMENT_STATUSES = {"Filled", "Cancelled", "Closed"}


def resolve_timezone(timezone_name: str):
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        if timezone_name == "Asia/Kolkata":
            return dt_timezone(timedelta(hours=5, minutes=30))
        return dt_timezone.utc


def to_local_date(start_utc: str | datetime, timezone_name: str):
    value = start_utc if isinstance(start_utc, datetime) else datetime.fromisoformat(start_utc)
    return value.astimezone(resolve_timezone(timezone_name)).date()


def reporting_records() -> tuple[list[dict], list[dict]]:
    if not settings.demo_mode:
        return DynamoRepository().list_reporting_records()
    requisitions = list(local_state.requisitions.values())
    interviews = [
        {
            "interview_id": interview.interview_id,
            "requisition_id": interview.requisition_id,
            "candidate_id": interview.candidate_id,
            "department": interview.department,
            "project": interview.project,
            "panel_subs": interview.panel_subs,
            "lead_panel_sub": interview.lead_panel_sub,
            "round_name": interview.round_name,
            "interview_type": interview.interview_type,
            "mode": interview.mode,
            "meeting_url": interview.meeting_url,
            "venue": interview.venue,
            "instructions": interview.instructions,
            "start_utc": interview.start_utc,
            "end_utc": interview.end_utc,
            "timezone": interview.timezone,
            "status": interview.status,
            "version": interview.version,
            "feedback_status": "Not Started",
        }
        for interview in local_state.scheduling_store.interviews.values()
    ]
    return requisitions, interviews


def visible_records(user) -> tuple[list[dict], list[dict]]:
    requisitions, interviews = reporting_records()
    if Role.ADMINISTRATOR in user.groups or Role.TA in user.groups:
        return requisitions, interviews
    if Role.PANEL in user.groups:
        visible_interviews = [item for item in interviews if user.sub in item["panel_subs"]]
        visible_ids = {item["requisition_id"] for item in visible_interviews}
        return [item for item in requisitions if item["requisition_id"] in visible_ids], visible_interviews
    if Role.MANAGER in user.groups:
        scopes = manager_scopes_for(user)
        in_scope = lambda item: f"{item.get('department', '')}#{item.get('project', '')}" in scopes
        return [item for item in requisitions if in_scope(item)], [item for item in interviews if in_scope(item)]
    return [], []


def list_candidates_for_lookup() -> list[dict]:
    if settings.demo_mode:
        return list(local_state.candidates.values())
    return DynamoRepository().list_candidates()
