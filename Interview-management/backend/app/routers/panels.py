from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Query

from app.auth import CurrentUser
from app.deps import require_capability
from app.permissions import Capability
from app.records import visible_records
from app.state import local_state

router = APIRouter(prefix="/panels", tags=["panels"])


@router.get("/members")
def list_panel_members(user=CurrentUser):
    require_capability(user, Capability.MANAGE_SCHEDULING)
    return {
        "panel_members": [
            {
                "sub": profile["sub"],
                "email": profile.get("email") or profile["sub"],
                "skills": profile.get("skills", []),
                "availability_slots": len(profile.get("availability", [])),
            }
            for profile in local_state.users.values()
            if "Panel" in profile.get("groups", []) and profile.get("status", "ACTIVE") == "ACTIVE"
        ]
    }


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
