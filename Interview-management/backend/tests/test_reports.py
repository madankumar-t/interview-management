from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app.state import local_state


def _override(user: AuthContext):
    async def dep():
        return user

    return dep


def test_daily_and_weekly_reports_by_requirement(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    original_requisitions = dict(local_state.requisitions)
    original_interviews = dict(local_state.scheduling_store.interviews)
    original_reserved = dict(local_state.scheduling_store.reserved)
    original_idempotency = dict(local_state.scheduling_store.idempotency)
    try:
        local_state.requisitions.clear()
        local_state.scheduling_store.interviews.clear()
        local_state.scheduling_store.reserved.clear()
        local_state.scheduling_store.idempotency.clear()

        local_state.requisitions["REQ-R1"] = {
            "requisition_id": "REQ-R1",
            "title": "Backend Engineer",
            "department": "Engineering",
            "project": "Core",
            "status": "Sourcing",
            "positions_total": 3,
            "positions_filled": 1,
            "client_name": "Contoso",
        }
        local_state.requisitions["REQ-R2"] = {
            "requisition_id": "REQ-R2",
            "title": "Frontend Engineer",
            "department": "Engineering",
            "project": "Core",
            "status": "Interviewing",
            "positions_total": 2,
            "positions_filled": 0,
            "client_name": "Fabrikam",
        }

        local_state.scheduling_service.schedule(
            {
                "candidate_id": "c1",
                "requisition_id": "REQ-R1",
                "department": "Engineering",
                "project": "Core",
                "panel_subs": ["panel-a"],
                "lead_panel_sub": "panel-a",
                "start_local_iso": "2026-12-01T10:00:00+05:30",
                "end_local_iso": "2026-12-01T11:00:00+05:30",
                "timezone": "Asia/Kolkata",
                "idempotency_key": "rep-k1",
            }
        )
        local_state.scheduling_service.schedule(
            {
                "candidate_id": "c2",
                "requisition_id": "REQ-R2",
                "department": "Engineering",
                "project": "Core",
                "panel_subs": ["panel-a"],
                "lead_panel_sub": "panel-a",
                "start_local_iso": "2026-12-01T12:00:00+05:30",
                "end_local_iso": "2026-12-01T13:00:00+05:30",
                "timezone": "Asia/Kolkata",
                "idempotency_key": "rep-k2",
            }
        )

        app.dependency_overrides[get_current_user] = _override(
            AuthContext(sub="demo-manager-1", groups={Role.MANAGER}, token_use="access", authz_version=1)
        )
        client = TestClient(app)

        daily = client.get("/reports/daily-interviews", params={"date": "2026-12-01", "timezone": "Asia/Kolkata"})
        assert daily.status_code == 200
        daily_body = daily.json()
        assert daily_body["total_scheduled"] == 2
        assert len(daily_body["by_requisition"]) == 2

        weekly = client.get("/reports/weekly-requirement", params={"week_start": "2026-12-01", "timezone": "Asia/Kolkata"})
        assert weekly.status_code == 200
        weekly_body = weekly.json()
        assert len(weekly_body["requirements"]) == 2
        req_r1 = next(row for row in weekly_body["requirements"] if row["requisition_id"] == "REQ-R1")
        assert req_r1["positions_open"] == 2
        assert req_r1["interviews_total"] == 1

        overview = client.get("/reports/overview", params={"open_only": "true", "client_name": "Contoso"})
        assert overview.status_code == 200
        overview_body = overview.json()
        assert overview_body["summary"]["open_requirements"] == 1
        assert overview_body["summary"]["open_positions"] == 2
        assert overview_body["summary"]["clients"] == 1
        assert [row["requisition_id"] for row in overview_body["requirements"]] == ["REQ-R1"]
    finally:
        app.dependency_overrides.clear()
        local_state.requisitions.clear()
        local_state.requisitions.update(original_requisitions)
        local_state.scheduling_store.interviews.clear()
        local_state.scheduling_store.interviews.update(original_interviews)
        local_state.scheduling_store.reserved.clear()
        local_state.scheduling_store.reserved.update(original_reserved)
        local_state.scheduling_store.idempotency.clear()
        local_state.scheduling_store.idempotency.update(original_idempotency)


def test_production_overview_uses_dynamodb_records(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", False)
    monkeypatch.setattr(
        "app.records.DynamoRepository.list_reporting_records",
        lambda _self: (
            [
                {
                    "requisition_id": "REQ-OPEN",
                    "title": "Platform Engineer",
                    "client_name": "Northwind",
                    "status": "Approved",
                    "positions_total": 4,
                    "positions_filled": 1,
                    "positions_open": 3,
                    "department": "Engineering",
                    "project": "Platform",
                }
            ],
            [],
        ),
    )
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="admin-1", groups={Role.ADMINISTRATOR}, token_use="access", authz_version=0)
    )
    try:
        response = TestClient(app).get("/reports/overview")
        assert response.status_code == 200
        body = response.json()
        assert body["summary"]["open_requirements"] == 1
        assert body["summary"]["open_positions"] == 3
        assert body["requirements"][0]["interviews_total"] == 0
    finally:
        app.dependency_overrides.clear()


def test_panel_report_splits_internal_and_external_panels(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(
        "app.routers.reports.visible_records",
        lambda _user: (
            [],
            [
                {
                    "interview_id": "i-1",
                    "panel_subs": ["panel-internal"],
                    "status": "Completed",
                    "feedback_status": "Submitted",
                },
                {
                    "interview_id": "i-2",
                    "panel_subs": ["panel-external"],
                    "status": "Scheduled",
                    "feedback_status": "Not Started",
                },
                {
                    "interview_id": "i-3",
                    "panel_subs": ["panel-internal", "panel-external"],
                    "status": "Cancelled",
                    "feedback_status": "Not Started",
                },
            ],
        ),
    )
    monkeypatch.setattr(
        "app.routers.reports._panel_records",
        lambda: [
            {
                "panel_id": "p-1",
                "sub": "panel-internal",
                "full_name": "Internal Interviewer",
                "email": "internal@example.com",
                "panel_type": "Internal",
                "status": "Active",
                "availability_slots": 2,
            },
            {
                "panel_id": "p-2",
                "sub": "panel-external",
                "full_name": "External Interviewer",
                "email": "external@example.com",
                "panel_type": "External",
                "status": "Active",
                "availability_slots": 1,
            },
        ],
    )
    monkeypatch.setattr(
        "app.routers.reports._submitted_feedback_authors",
        lambda _interviews: {"i-1": {"panel-internal"}},
    )
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="admin-1", groups={Role.ADMINISTRATOR}, token_use="access", authz_version=1)
    )
    try:
        client = TestClient(app)
        response = client.get("/reports/panels")
        assert response.status_code == 200
        body = response.json()
        assert body["summary"]["Internal"] == {
            "panels": 1,
            "interviews": 2,
            "completed": 1,
            "pending_feedback": 0,
        }
        assert body["summary"]["External"] == {
            "panels": 1,
            "interviews": 2,
            "completed": 0,
            "pending_feedback": 1,
        }
        external = next(row for row in body["panels"] if row["panel_type"] == "External")
        assert external["scheduled"] == 1
        assert external["cancelled"] == 1
        assert external["availability_slots"] == 1

        filtered = client.get("/reports/panels", params={"panel_type": "External"})
        assert filtered.status_code == 200
        assert [row["panel_type"] for row in filtered.json()["panels"]] == ["External"]
    finally:
        app.dependency_overrides.clear()


def test_monthly_interviews_groups_visible_records_in_requested_timezone(monkeypatch) -> None:
    requisitions = [
        {"requisition_id": "REQ-B", "title": "Backend Engineer", "client_name": "Contoso"},
        {"requisition_id": "REQ-A", "title": "Data Engineer", "client_name": "Fabrikam"},
    ]
    interviews = [
        {
            "requisition_id": "REQ-B",
            "start_utc": "2026-08-01T03:59:59+00:00",
            "status": "Scheduled",
            "feedback_status": "Not Started",
        },
        {
            "requisition_id": "REQ-B",
            "start_utc": "2026-08-01T04:00:00+00:00",
            "status": "Scheduled",
            "feedback_status": "Submitted",
        },
        {
            "requisition_id": "REQ-B",
            "start_utc": "2026-08-15T12:00:00+00:00",
            "status": "In Progress",
            "feedback_status": "Draft",
        },
        {
            "requisition_id": "REQ-A",
            "start_utc": "2026-09-01T03:59:59+00:00",
            "status": "Completed",
            "feedback_status": "Submitted",
        },
        {
            "requisition_id": "REQ-A",
            "start_utc": "2026-08-20T12:00:00+00:00",
            "status": "Cancelled",
            "feedback_status": "Not Started",
        },
        {
            "requisition_id": "REQ-A",
            "start_utc": "2026-08-21T12:00:00+00:00",
            "status": "No Show",
            "feedback_status": "Not Started",
        },
        {
            "requisition_id": "REQ-A",
            "start_utc": "2026-09-01T04:00:00+00:00",
            "status": "Completed",
            "feedback_status": "Not Started",
        },
    ]
    manager = AuthContext(
        sub="manager-1",
        groups={Role.MANAGER},
        token_use="access",
        authz_version=1,
    )
    seen_users = []

    def records_for_user(user):
        seen_users.append(user)
        return requisitions, interviews

    monkeypatch.setattr("app.routers.reports.visible_records", records_for_user)
    app.dependency_overrides[get_current_user] = _override(manager)
    try:
        response = TestClient(app).get(
            "/reports/monthly-interviews",
            params={"month": "2026-08", "timezone": "America/New_York"},
        )
        assert response.status_code == 200
        assert seen_users == [manager]
        assert response.json() == {
            "month": "2026-08",
            "month_end_exclusive": "2026-09-01",
            "timezone": "America/New_York",
            "summary": {
                "total": 5,
                "scheduled": 1,
                "in_progress": 1,
                "completed": 1,
                "cancelled": 1,
                "no_show": 1,
                "pending_feedback": 3,
            },
            "rows": [
                {
                    "requisition_id": "REQ-A",
                    "title": "Data Engineer",
                    "client_name": "Fabrikam",
                    "total": 3,
                    "scheduled": 0,
                    "in_progress": 0,
                    "completed": 1,
                    "cancelled": 1,
                    "no_show": 1,
                    "pending_feedback": 2,
                },
                {
                    "requisition_id": "REQ-B",
                    "title": "Backend Engineer",
                    "client_name": "Contoso",
                    "total": 2,
                    "scheduled": 1,
                    "in_progress": 1,
                    "completed": 0,
                    "cancelled": 0,
                    "no_show": 0,
                    "pending_feedback": 1,
                },
            ],
            "panel_rows": [],
        }
    finally:
        app.dependency_overrides.clear()


def test_monthly_interviews_rejects_invalid_month(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routers.reports.visible_records",
        lambda _user: (_ for _ in ()).throw(AssertionError("visible_records should not be called")),
    )
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="manager-1", groups={Role.MANAGER}, token_use="access", authz_version=1)
    )
    try:
        response = TestClient(app).get("/reports/monthly-interviews", params={"month": "2026-8"})
        assert response.status_code == 422
        assert response.json()["detail"] == "Invalid month format. Use YYYY-MM"
    finally:
        app.dependency_overrides.clear()


def test_monthly_interviews_requires_view_reports(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.routers.reports.visible_records",
        lambda _user: (_ for _ in ()).throw(AssertionError("visible_records should not be called")),
    )
    app.dependency_overrides[get_current_user] = _override(
        AuthContext(sub="ta-1", groups={Role.TA}, token_use="access", authz_version=1)
    )
    try:
        response = TestClient(app).get("/reports/monthly-interviews", params={"month": "2026-08"})
        assert response.status_code == 403
        assert response.json()["detail"] == "Insufficient permissions"
    finally:
        app.dependency_overrides.clear()
