from datetime import datetime, timedelta, timezone

from app.models import INTERVIEW_FEEDBACK_ELIGIBLE_STATUSES
from app.repository import DynamoRepository


def overdue_recipients(interview: dict, feedback: list[dict], ta_owner_sub: str | None, now: datetime) -> list[str]:
    if interview.get("status") not in INTERVIEW_FEEDBACK_ELIGIBLE_STATUSES:
        return []
    end = datetime.fromisoformat(interview["end_utc"].replace("Z", "+00:00"))
    if now < end + timedelta(hours=24):
        return []
    submitted = {item["author_sub"] for item in feedback if item.get("status") == "Submitted"}
    missing = set(interview.get("panel_subs", [])) - submitted
    if not missing:
        return []
    if ta_owner_sub:
        missing.add(ta_owner_sub)
    return sorted(missing)


def run_reminders(repo: DynamoRepository, now: datetime | None = None) -> int:
    current = now or datetime.now(timezone.utc)
    _, interviews = repo.list_reporting_records()
    count = 0
    for interview in interviews:
        if interview.get("status") not in INTERVIEW_FEEDBACK_ELIGIBLE_STATUSES:
            continue
        if current < datetime.fromisoformat(interview["end_utc"].replace("Z", "+00:00")) + timedelta(hours=24):
            continue
        feedback = repo.list_feedback(interview["interview_id"])
        ta_owner_sub = repo.get_candidate_ta_owner(interview["candidate_id"])
        for recipient in overdue_recipients(interview, feedback, ta_owner_sub, current):
            if repo.create_feedback_reminder(interview, recipient, current.isoformat()):
                count += 1
    return count


def handler(_event, _context):
    return {"reminders_created": run_reminders(DynamoRepository())}