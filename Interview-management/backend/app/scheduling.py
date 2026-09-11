from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Protocol
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.config import settings


class SchedulingConflictError(Exception):
    pass


class VersionConflictError(Exception):
    pass


@dataclass
class Interview:
    interview_id: str
    candidate_id: str
    requisition_id: str
    department: str
    project: str
    panel_subs: list[str]
    lead_panel_sub: str
    start_utc: datetime
    end_utc: datetime
    timezone: str
    round_name: str = ""
    interview_type: str = ""
    mode: str = ""
    meeting_url: str | None = None
    venue: str | None = None
    instructions: str | None = None
    required_skills: list[str] = field(default_factory=list)
    status: str = "Scheduled"
    version: int = 1
    history: list[dict] = field(default_factory=list)


class ScheduleStore(Protocol):
    def create(self, interview: Interview, idempotency_key: str) -> Interview: ...
    def get(self, interview_id: str) -> Interview | None: ...
    def reschedule(self, interview_id: str, start_utc: datetime, end_utc: datetime, expected_version: int, reason: str, idempotency_key: str) -> Interview: ...


def parse_local_window(start_local_iso: str, end_local_iso: str, timezone_name: str) -> tuple[datetime, datetime]:
    start_local = datetime.fromisoformat(start_local_iso)
    end_local = datetime.fromisoformat(end_local_iso)
    if start_local.tzinfo is None:
        start_local = start_local.replace(tzinfo=ZoneInfo(timezone_name))
    if end_local.tzinfo is None:
        end_local = end_local.replace(tzinfo=ZoneInfo(timezone_name))
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)
    if end_utc <= start_utc:
        raise ValueError("End time must be after start time")
    return start_utc, end_utc


def _slot_range(start_utc: datetime, end_utc: datetime) -> list[str]:
    slot_minutes = settings.reservation_slot_minutes
    start = start_utc - timedelta(minutes=settings.reservation_buffer_minutes)
    end = end_utc + timedelta(minutes=settings.reservation_buffer_minutes)
    out: list[str] = []
    cursor = start
    while cursor < end:
        out.append(cursor.strftime("%Y%m%d%H%M"))
        cursor += timedelta(minutes=slot_minutes)
    return out


class InMemoryScheduleStore(ScheduleStore):
    def __init__(self) -> None:
        self.interviews: dict[str, Interview] = {}
        self.idempotency: dict[str, str] = {}
        self.reserved: dict[str, str] = {}

    def _reserve(self, interview: Interview) -> None:
        slots = _slot_range(interview.start_utc, interview.end_utc)
        subjects = interview.panel_subs + [f"CANDIDATE::{interview.candidate_id}"]
        keys = [f"{subject}#{slot}" for subject in subjects for slot in slots]
        conflicts = [key for key in keys if key in self.reserved and self.reserved[key] != interview.interview_id]
        if conflicts:
            raise SchedulingConflictError("Double-booking detected")
        for key in keys:
            self.reserved[key] = interview.interview_id

    def _release(self, interview: Interview) -> None:
        slots = _slot_range(interview.start_utc, interview.end_utc)
        subjects = interview.panel_subs + [f"CANDIDATE::{interview.candidate_id}"]
        for subject in subjects:
            for slot in slots:
                self.reserved.pop(f"{subject}#{slot}", None)

    def create(self, interview: Interview, idempotency_key: str) -> Interview:
        if idempotency_key in self.idempotency:
            return self.interviews[self.idempotency[idempotency_key]]
        self._reserve(interview)
        self.interviews[interview.interview_id] = interview
        self.idempotency[idempotency_key] = interview.interview_id
        return interview

    def get(self, interview_id: str) -> Interview | None:
        return self.interviews.get(interview_id)

    def reschedule(
        self,
        interview_id: str,
        start_utc: datetime,
        end_utc: datetime,
        expected_version: int,
        reason: str,
        idempotency_key: str,
    ) -> Interview:
        if idempotency_key in self.idempotency:
            return self.interviews[self.idempotency[idempotency_key]]
        current = self.interviews.get(interview_id)
        if not current:
            raise KeyError("Interview not found")
        if current.version != expected_version:
            raise VersionConflictError("Interview version mismatch")
        snapshot = Interview(**{**current.__dict__})
        self._release(current)
        current.start_utc = start_utc
        current.end_utc = end_utc
        current.version += 1
        current.history.append(
            {
                "action": "rescheduled",
                "reason": reason,
                "old_start_utc": snapshot.start_utc.isoformat(),
                "old_end_utc": snapshot.end_utc.isoformat(),
                "new_start_utc": start_utc.isoformat(),
                "new_end_utc": end_utc.isoformat(),
            }
        )
        try:
            self._reserve(current)
        except SchedulingConflictError as exc:
            current.start_utc = snapshot.start_utc
            current.end_utc = snapshot.end_utc
            current.version -= 1
            self._reserve(current)
            raise exc
        self.idempotency[idempotency_key] = interview_id
        return current


class SchedulingService:
    def __init__(self, store: ScheduleStore) -> None:
        self.store = store

    def schedule(self, payload: dict) -> Interview:
        start_utc, end_utc = parse_local_window(payload["start_local_iso"], payload["end_local_iso"], payload["timezone"])
        interview = Interview(
            interview_id=str(uuid4()),
            candidate_id=payload["candidate_id"],
            requisition_id=payload["requisition_id"],
            department=payload["department"],
            project=payload["project"],
            panel_subs=payload["panel_subs"],
            lead_panel_sub=payload["lead_panel_sub"],
            start_utc=start_utc,
            end_utc=end_utc,
            timezone=payload["timezone"],
            round_name=payload.get("round_name", ""),
            interview_type=payload.get("interview_type", ""),
            mode=payload.get("mode", ""),
            meeting_url=payload.get("meeting_url"),
            venue=payload.get("venue"),
            instructions=payload.get("instructions"),
            required_skills=payload.get("required_skills", []),
        )
        return self.store.create(interview, payload["idempotency_key"])

    def reschedule(self, interview_id: str, payload: dict) -> Interview:
        start_utc, end_utc = parse_local_window(payload["start_local_iso"], payload["end_local_iso"], payload["timezone"])
        return self.store.reschedule(
            interview_id=interview_id,
            start_utc=start_utc,
            end_utc=end_utc,
            expected_version=payload["expected_version"],
            reason=payload["reason"],
            idempotency_key=payload["idempotency_key"],
        )

