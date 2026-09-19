import re
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status

from app.auth import CurrentUser
from app.deps import require_capability
from app.config import settings
from app.models import Role
from app.permissions import Capability
from app.records import CLOSED_REQUIREMENT_STATUSES, resolve_timezone, to_local_date, visible_records
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/reports", tags=["reports"])


def _parse_datetime(value: str | datetime) -> datetime:
    return value if isinstance(value, datetime) else datetime.fromisoformat(value)


def _matches_requirement(
    requirement: dict,
    requisition_id: str,
    client_name: str,
    requirement_status: str,
    open_only: bool,
) -> bool:
    if requisition_id and requirement["requisition_id"] != requisition_id:
        return False
    if client_name and requirement.get("client_name", "").casefold() != client_name.casefold():
        return False
    if requirement_status and requirement.get("status", "").casefold() != requirement_status.casefold():
        return False
    return not open_only or (
        requirement.get("status") not in CLOSED_REQUIREMENT_STATUSES
        and int(requirement.get("positions_open", 0)) > 0
    )


def _requirement_rows(requisitions: list[dict], interviews: list[dict]) -> list[dict]:
    counters: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for interview in interviews:
        stats = counters[interview["requisition_id"]]
        stats["interviews_total"] += 1
        stats[interview["status"]] += 1
        if interview.get("feedback_status", "Not Started") != "Submitted":
            stats["pending_feedback"] += 1

    rows = []
    for requisition in requisitions:
        requisition_id = requisition["requisition_id"]
        stats = counters[requisition_id]
        positions_total = int(requisition.get("positions_total", 0) or 0)
        positions_filled = int(requisition.get("positions_filled", 0) or 0)
        rows.append(
            {
                **requisition,
                "positions_total": positions_total,
                "positions_filled": positions_filled,
                "positions_open": int(requisition.get("positions_open", max(0, positions_total - positions_filled))),
                "interviews_total": stats["interviews_total"],
                "scheduled": stats["Scheduled"],
                "in_progress": stats["In Progress"],
                "completed": stats["Completed"],
                "cancelled": stats["Cancelled"],
                "no_show": stats["No Show"],
                "pending_feedback": stats["pending_feedback"],
            }
        )
    return sorted(rows, key=lambda item: item["requisition_id"])


def _panel_records() -> list[dict]:
    if not settings.demo_mode:
        return DynamoRepository().list_panels()
    return [
        {
            "panel_id": profile.get("panel_id", profile["sub"]),
            "sub": profile["sub"],
            "full_name": profile.get("full_name", ""),
            "email": profile.get("email", ""),
            "panel_type": profile.get("panel_type", "Internal"),
            "status": profile.get("status", "Active"),
            "availability_slots": len(profile.get("availability", [])),
        }
        for profile in local_state.users.values()
        if "Panel" in profile.get("groups", [])
    ]


def _submitted_feedback_authors(interviews: list[dict]) -> dict[str, set[str]]:
    if settings.demo_mode:
        result: dict[str, set[str]] = defaultdict(set)
        for feedback in local_state.feedback.values():
            if feedback.get("status") == "Submitted":
                result[feedback["interview_id"]].add(feedback["author_sub"])
        return result
    repo = DynamoRepository()
    return {
        interview["interview_id"]: {
            record["author_sub"]
            for record in repo.list_feedback(interview["interview_id"])
            if record.get("status") == "Submitted"
        }
        for interview in interviews
    }


@router.get("/overview")
def overview(
    user=CurrentUser,
    requisition_id: str = Query(default=""),
    client_name: str = Query(default=""),
    requirement_status: str = Query(alias="status", default=""),
    open_only: bool = Query(default=False),
    timezone_name: str = Query(alias="timezone", default="Asia/Kolkata"),
):
    require_capability(user, Capability.VIEW_REPORTS)
    requisitions, interviews = visible_records(user)
    requirements = [
        row
        for row in _requirement_rows(requisitions, interviews)
        if _matches_requirement(row, requisition_id, client_name, requirement_status, open_only)
    ]
    requirement_ids = {row["requisition_id"] for row in requirements}
    filtered_interviews = [item for item in interviews if item["requisition_id"] in requirement_ids]
    today = datetime.now(resolve_timezone(timezone_name)).date()
    open_requirements = [
        row
        for row in requirements
        if row["status"] not in CLOSED_REQUIREMENT_STATUSES and row["positions_open"] > 0
    ]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": timezone_name,
        "summary": {
            "total_requirements": len(requirements),
            "open_requirements": len(open_requirements),
            "open_positions": sum(row["positions_open"] for row in open_requirements),
            "clients": len({row["client_name"] for row in requirements if row.get("client_name")}),
            "today_interviews": sum(to_local_date(item["start_utc"], timezone_name) == today for item in filtered_interviews),
            "upcoming_interviews": sum(
                _parse_datetime(item["start_utc"]) >= datetime.now(timezone.utc)
                and item["status"] in {"Scheduled", "In Progress"}
                for item in filtered_interviews
            ),
            "pending_feedback": sum(item.get("feedback_status", "Not Started") != "Submitted" for item in filtered_interviews),
        },
        "filters": {
            "requisitions": sorted({row["requisition_id"] for row in requisitions}),
            "clients": sorted({row["client_name"] for row in requisitions if row.get("client_name")}),
            "statuses": sorted({row["status"] for row in requisitions if row.get("status")}),
        },
        "requirements": requirements,
    }


@router.get("/workload")
def workload(user=CurrentUser):
    require_capability(user, Capability.VIEW_REPORTS)
    _, interviews = visible_records(user)
    own = [item for item in interviews if user.sub in item["panel_subs"]]
    return {"total_interviews": len(interviews), "my_interviews": len(own)}


@router.get("/panels")
def panel_report(user=CurrentUser, panel_type: str = Query(default="")):
    require_capability(user, Capability.VIEW_REPORTS)
    _, interviews = visible_records(user)
    assigned_subs = {sub for interview in interviews for sub in interview.get("panel_subs", [])}
    panels = _panel_records()
    if Role.MANAGER in user.groups:
        panels = [panel for panel in panels if panel["sub"] in assigned_subs]
    if panel_type:
        panels = [panel for panel in panels if panel.get("panel_type", "").casefold() == panel_type.casefold()]

    submitted_authors = _submitted_feedback_authors(interviews)
    rows = []
    for panel in panels:
        assigned = [interview for interview in interviews if panel["sub"] in interview.get("panel_subs", [])]
        rows.append(
            {
                **panel,
                "interviews_total": len(assigned),
                "scheduled": sum(interview.get("status") == "Scheduled" for interview in assigned),
                "in_progress": sum(interview.get("status") == "In Progress" for interview in assigned),
                "completed": sum(interview.get("status") == "Completed" for interview in assigned),
                "cancelled": sum(interview.get("status") == "Cancelled" for interview in assigned),
                "no_show": sum(interview.get("status") == "No Show" for interview in assigned),
                "pending_feedback": sum(
                    interview.get("status") in {"Scheduled", "Completed"}
                    and panel["sub"] not in submitted_authors.get(interview["interview_id"], set())
                    for interview in assigned
                ),
            }
        )
    rows.sort(key=lambda item: (item.get("full_name") or item.get("email") or item["sub"]).casefold())

    types = ("Internal", "External")
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            panel_type_name: {
                "panels": sum(row.get("panel_type") == panel_type_name for row in rows),
                "interviews": sum(row["interviews_total"] for row in rows if row.get("panel_type") == panel_type_name),
                "completed": sum(row["completed"] for row in rows if row.get("panel_type") == panel_type_name),
                "pending_feedback": sum(row["pending_feedback"] for row in rows if row.get("panel_type") == panel_type_name),
            }
            for panel_type_name in types
        },
        "panels": rows,
    }


@router.get("/daily-interviews")
def daily_interviews(
    user=CurrentUser,
    report_date: str = Query(alias="date", default=""),
    timezone_name: str = Query(alias="timezone", default="Asia/Kolkata"),
):
    require_capability(user, Capability.VIEW_REPORTS)
    try:
        selected_date = date.fromisoformat(report_date) if report_date else datetime.now(resolve_timezone(timezone_name)).date()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid date format. Use YYYY-MM-DD") from exc
    requisitions, interviews = visible_records(user)
    requisitions_by_id = {item["requisition_id"]: item for item in requisitions}
    grouped: dict[str, dict] = {}
    rows: list[dict] = []
    for interview in interviews:
        if interview["status"] != "Scheduled" or to_local_date(interview["start_utc"], timezone_name) != selected_date:
            continue
        requisition = requisitions_by_id.get(interview["requisition_id"], {})
        item = grouped.setdefault(
            interview["requisition_id"],
            {
                "requisition_id": interview["requisition_id"],
                "title": requisition.get("title", ""),
                "client_name": requisition.get("client_name", ""),
                "scheduled_count": 0,
            },
        )
        item["scheduled_count"] += 1
        rows.append({**interview, "start_utc": _parse_datetime(interview["start_utc"]).isoformat(), "end_utc": _parse_datetime(interview["end_utc"]).isoformat()})
    return {
        "date": selected_date.isoformat(),
        "timezone": timezone_name,
        "total_scheduled": len(rows),
        "by_requisition": list(grouped.values()),
        "interviews": rows,
    }


@router.get("/weekly-requirement")
def weekly_requirement(
    user=CurrentUser,
    week_start: str = Query(default=""),
    timezone_name: str = Query(alias="timezone", default="Asia/Kolkata"),
):
    require_capability(user, Capability.VIEW_REPORTS)
    try:
        start_date = date.fromisoformat(week_start) if week_start else datetime.now(resolve_timezone(timezone_name)).date()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid week_start format. Use YYYY-MM-DD") from exc
    end_date = start_date + timedelta(days=7)
    requisitions, interviews = visible_records(user)
    weekly_interviews = [
        item
        for item in interviews
        if start_date <= to_local_date(item["start_utc"], timezone_name) < end_date
    ]
    return {
        "week_start": start_date.isoformat(),
        "week_end_exclusive": end_date.isoformat(),
        "timezone": timezone_name,
        "requirements": _requirement_rows(requisitions, weekly_interviews),
    }


@router.get("/monthly-interviews")
def monthly_interviews(
    user=CurrentUser,
    month: str = Query(...),
    timezone_name: str = Query(alias="timezone", default="Asia/Kolkata"),
):
    require_capability(user, Capability.VIEW_REPORTS)
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", month):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid month format. Use YYYY-MM",
        )

    try:
        month_start = date.fromisoformat(f"{month}-01")
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid month format. Use YYYY-MM",
        ) from exc
    month_end = (month_start.replace(day=28) + timedelta(days=4)).replace(day=1)
    requisitions, interviews = visible_records(user)
    requisitions_by_id = {item["requisition_id"]: item for item in requisitions}
    count_keys = ("scheduled", "in_progress", "completed", "cancelled", "no_show", "pending_feedback")
    grouped: dict[str, dict] = {}

    for interview in interviews:
        interview_date = to_local_date(interview["start_utc"], timezone_name)
        if not month_start <= interview_date < month_end:
            continue

        requisition_id = interview["requisition_id"]
        requisition = requisitions_by_id.get(requisition_id, {})
        row = grouped.setdefault(
            requisition_id,
            {
                "requisition_id": requisition_id,
                "title": requisition.get("title", ""),
                "client_name": requisition.get("client_name", ""),
                "total": 0,
                **{key: 0 for key in count_keys},
            },
        )
        row["total"] += 1
        status_key = interview.get("status", "").casefold().replace(" ", "_")
        if status_key in count_keys:
            row[status_key] += 1
        if interview.get("feedback_status", "Not Started") != "Submitted":
            row["pending_feedback"] += 1

    rows = sorted(grouped.values(), key=lambda item: item["requisition_id"])
    panel_details = {panel["sub"]: panel for panel in _panel_records()} if any(
        interview.get("panel_subs") for interview in interviews
    ) else {}
    panel_grouped: dict[str, dict] = {}
    for interview in interviews:
        interview_date = to_local_date(interview["start_utc"], timezone_name)
        if not month_start <= interview_date < month_end:
            continue
        status_key = interview.get("status", "").casefold().replace(" ", "_")
        for panel_sub in interview.get("panel_subs", []):
            panel = panel_details.get(panel_sub, {})
            row = panel_grouped.setdefault(
                panel_sub,
                {
                    "panel_sub": panel_sub,
                    "full_name": panel.get("full_name", ""),
                    "email": panel.get("email", ""),
                    "panel_type": panel.get("panel_type", ""),
                    "total": 0,
                    **{key: 0 for key in count_keys},
                },
            )
            row["total"] += 1
            if status_key in count_keys:
                row[status_key] += 1
            if interview.get("feedback_status", "Not Started") != "Submitted":
                row["pending_feedback"] += 1
    panel_rows = sorted(panel_grouped.values(), key=lambda item: (item["full_name"] or item["email"] or item["panel_sub"]).casefold())
    return {
        "month": month,
        "month_end_exclusive": month_end.isoformat(),
        "timezone": timezone_name,
        "summary": {
            "total": sum(row["total"] for row in rows),
            **{key: sum(row[key] for row in rows) for key in count_keys},
        },
        "rows": rows,
        "panel_rows": panel_rows,
    }
