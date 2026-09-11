from __future__ import annotations

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, status

from app.auth import CurrentUser
from app.config import settings
from app.deps import require_capability
from app.identity import CognitoAdmin
from app.models import PanelCreateRequest, PanelStatusUpdateRequest, utc_now_iso
from app.permissions import Capability
from app.records import visible_records
from app.repository import DynamoRepository
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
    require_capability(user, Capability.MANAGE_SCHEDULING)
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
        records = DynamoRepository().list_panels()
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


@router.get("/conflicts")
def check_conflicts(
    user=CurrentUser,
    panel_subs: str = Query(default=""),
    start_utc: str = Query(...),
    end_utc: str = Query(...),
):
    require_capability(user, Capability.MANAGE_SCHEDULING)
    subs = {value for value in panel_subs.split(",") if value}
    new_start = datetime.fromisoformat(start_utc)
    new_end = datetime.fromisoformat(end_utc)
    _, interviews = visible_records(user)
    conflicts = []
    for interview in interviews:
        if interview.get("status") not in ("Scheduled", "In Progress"):
            continue
        overlap_subs = subs.intersection(interview.get("panel_subs", []))
        if not overlap_subs:
            continue
        existing_start = datetime.fromisoformat(interview["start_utc"])
        existing_end = datetime.fromisoformat(interview["end_utc"])
        if existing_start < new_end and new_start < existing_end:
            conflicts.append(
                {
                    "panel_subs": sorted(overlap_subs),
                    "interview_id": interview["interview_id"],
                    "start_utc": interview["start_utc"],
                    "end_utc": interview["end_utc"],
                }
            )
    return {"conflicts": conflicts}
