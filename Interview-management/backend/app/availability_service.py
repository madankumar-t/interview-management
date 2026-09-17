from __future__ import annotations

from datetime import datetime

from app.config import settings
from app.repository import DynamoRepository
from app.state import local_state


def get_user_availability(sub: str, repo: DynamoRepository | None = None) -> list[dict[str, str]]:
    if settings.demo_mode:
        return local_state.users.get(sub, {}).get("availability", [])
    return (repo or DynamoRepository()).get_availability(sub)


def unavailable_panel_subs(
    panel_subs: list[str] | set[str],
    start_utc: str,
    end_utc: str,
    repo: DynamoRepository | None = None,
) -> list[str]:
    requested_start = datetime.fromisoformat(start_utc)
    requested_end = datetime.fromisoformat(end_utc)
    unavailable: list[str] = []
    for sub in sorted(set(panel_subs)):
        slots = get_user_availability(sub, repo)
        is_available = any(
            datetime.fromisoformat(slot["start_utc"]) <= requested_start
            and requested_end <= datetime.fromisoformat(slot["end_utc"])
            for slot in slots
        )
        if not is_available:
            unavailable.append(sub)
    return unavailable
