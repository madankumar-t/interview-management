from fastapi import APIRouter, HTTPException
from botocore.exceptions import ClientError

from app.auth import CurrentUser
from app.config import settings
from app.repository import DynamoRepository
from app.state import local_state

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("/me")
def my_reminders(user=CurrentUser):
    if settings.demo_mode:
        return {"reminders": local_state.users.get(user.sub, {}).get("reminders", [])}
    return {"reminders": DynamoRepository().list_feedback_reminders(user.sub)}


@router.delete("/me/{reminder_id}", status_code=204)
def dismiss_reminder(reminder_id: str, user=CurrentUser):
    if not reminder_id.startswith("REMINDER#FEEDBACK#") or len(reminder_id) > 200:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if settings.demo_mode:
        record = local_state.users.get(user.sub, {})
        record["reminders"] = [item for item in record.get("reminders", []) if item["id"] != reminder_id]
    else:
        try:
            DynamoRepository().dismiss_feedback_reminder(user.sub, reminder_id)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                raise HTTPException(status_code=404, detail="Reminder not found") from exc
            raise