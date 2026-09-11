from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app import records


def _override(sub: str):
    async def current_user():
        return AuthContext(sub=sub, email=f"{sub}@example.com", groups={Role.PANEL}, token_use="access")

    return current_user


def test_panel_list_contains_only_assigned_interviews(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr(
        records,
        "reporting_records",
        lambda: (
            [{"requisition_id": "REQ-1"}, {"requisition_id": "REQ-2"}],
            [
                {"interview_id": "i-1", "requisition_id": "REQ-1", "panel_subs": ["panel-a"]},
                {"interview_id": "i-2", "requisition_id": "REQ-2", "panel_subs": ["panel-b"]},
            ],
        ),
    )

    requisitions, interviews = records.visible_records(
        AuthContext(sub="panel-a", groups={Role.PANEL}, token_use="access")
    )

    assert [item["interview_id"] for item in interviews] == ["i-1"]
    assert [item["requisition_id"] for item in requisitions] == ["REQ-1"]


def test_unassigned_panel_cannot_save_or_submit_production_feedback(monkeypatch) -> None:
    class FakeRepository:
        def get_interview(self, _interview_id):
            return {"panel_subs": ["panel-a"], "department": "Engineering", "project": "Core"}

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr("app.routers.feedback.DynamoRepository", FakeRepository)
    app.dependency_overrides[get_current_user] = _override("panel-b")
    client = TestClient(app)
    payload = {
        "interview_id": "i-1",
        "competency_scores": {"Technical": 4},
        "strengths": "Strong fundamentals",
        "improvement_areas": "Communication",
        "recommendation": "Hire",
        "comments": "",
    }

    assert client.post("/feedback/draft", json=payload).status_code == 403
    assert client.post("/feedback/submit", json={"interview_id": "i-1"}).status_code == 403
    app.dependency_overrides.clear()


def test_assigned_panel_can_save_submit_and_only_read_own_draft(monkeypatch) -> None:
    class FakeRepository:
        def get_interview(self, _interview_id):
            return {"panel_subs": ["panel-a"], "department": "Engineering", "project": "Core"}

        def put_feedback_draft(self, interview_id, author_sub, payload):
            return {**payload, "interview_id": interview_id, "author_sub": author_sub, "status": "Draft"}

        def submit_feedback(self, interview_id, author_sub, _email, _roles):
            return {"interview_id": interview_id, "author_sub": author_sub, "status": "Submitted"}

        def list_feedback(self, interview_id):
            return [
                {"interview_id": interview_id, "author_sub": "panel-a", "status": "Draft"},
                {"interview_id": interview_id, "author_sub": "panel-b", "status": "Draft"},
                {"interview_id": interview_id, "author_sub": "panel-b", "status": "Submitted"},
            ]

    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr("app.routers.feedback.DynamoRepository", FakeRepository)
    app.dependency_overrides[get_current_user] = _override("panel-a")
    client = TestClient(app)
    payload = {
        "interview_id": "i-1",
        "competency_scores": {"Technical": 4},
        "strengths": "Strong fundamentals",
        "improvement_areas": "Communication",
        "recommendation": "Hire",
        "comments": "",
    }

    assert client.post("/feedback/draft", json=payload).status_code == 201
    assert client.post("/feedback/submit", json={"interview_id": "i-1"}).status_code == 200
    visible = client.get("/feedback/interview/i-1")
    assert visible.status_code == 200
    assert [(item["author_sub"], item["status"]) for item in visible.json()] == [
        ("panel-a", "Draft"),
        ("panel-b", "Submitted"),
    ]
    app.dependency_overrides.clear()