from datetime import datetime, timezone
from urllib.parse import quote

from fastapi.testclient import TestClient
from botocore.exceptions import ClientError

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app.reminders import run_reminders
from app.repository import DynamoRepository
from app.state import local_state


def test_reminds_missing_panel_and_ta_once_after_24_hours():
    interview = {
        "interview_id": "int-1", "candidate_id": "candidate-1", "panel_subs": ["panel-1", "panel-2"],
        "status": "L1 Scheduled", "version": 2, "end_utc": "2030-09-27T10:00:00+00:00",
    }

    class Repo:
        def __init__(self):
            self.sent = set()

        def list_reporting_records(self):
            return [], [interview]

        def list_feedback(self, _interview_id):
            return [{"author_sub": "panel-1", "status": "Submitted"}, {"author_sub": "panel-2", "status": "Draft"}]

        def get_candidate_ta_owner(self, _candidate_id):
            return "ta-1"

        def create_feedback_reminder(self, interview, recipient, _when):
            key = (interview["interview_id"], interview["version"], recipient)
            if key in self.sent:
                return False
            self.sent.add(key)
            return True

    repo = Repo()
    assert run_reminders(repo, datetime(2030, 9, 28, 9, 59, tzinfo=timezone.utc)) == 0
    assert run_reminders(repo, datetime(2030, 9, 28, 10, 0, tzinfo=timezone.utc)) == 2
    assert repo.sent == {("int-1", 2, "panel-2"), ("int-1", 2, "ta-1")}
    assert run_reminders(repo, datetime(2030, 9, 28, 11, 0, tzinfo=timezone.utc)) == 0
    interview["status"] = "Cancelled"
    assert run_reminders(repo, datetime(2030, 9, 28, 12, 0, tzinfo=timezone.utc)) == 0


def test_reminders_are_private_and_dismissible(monkeypatch):
    async def panel_user():
        return AuthContext(sub="panel-2", groups={Role.PANEL}, token_use="access")

    reminder = {"id": "REMINDER#FEEDBACK#int-1#2", "interview_id": "int-1", "created_at": "2030-09-28T10:00:00Z"}
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(local_state, "users", {"panel-1": {"reminders": [reminder]}, "panel-2": {"reminders": [reminder]}})
    app.dependency_overrides[get_current_user] = panel_user
    try:
        client = TestClient(app)
        assert client.get("/reminders/me").json()["reminders"] == [reminder]
        assert client.delete(f"/reminders/me/{quote(reminder['id'], safe='')}").status_code == 204
        assert client.get("/reminders/me").json()["reminders"] == []
        assert local_state.users["panel-1"]["reminders"] == [reminder]
        assert client.delete("/reminders/me/not-a-reminder").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_repository_dismissal_keeps_idempotency_record():
    class Client:
        def __init__(self):
            self.item = None

        def put_item(self, **kwargs):
            if self.item:
                raise ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem")
            self.item = kwargs["Item"]

        def update_item(self, **kwargs):
            self.item["dismissed"] = {"BOOL": True}

        def query(self, **_kwargs):
            return {"Items": [self.item]}

    repo = DynamoRepository.__new__(DynamoRepository)
    repo.client = Client()
    repo.table_name = "test"
    interview = {"interview_id": "int-1", "candidate_id": "candidate-1", "version": 1}
    assert repo.create_feedback_reminder(interview, "panel-1", "2030-09-28T10:00:00Z") is True
    assert len(repo.list_feedback_reminders("panel-1")) == 1
    repo.dismiss_feedback_reminder("panel-1", "REMINDER#FEEDBACK#int-1#1")
    assert repo.list_feedback_reminders("panel-1") == []
    assert repo.create_feedback_reminder(interview, "panel-1", "2030-09-28T11:00:00Z") is False