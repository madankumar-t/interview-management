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
            AuthContext(sub="demo-ta-1", groups={Role.TA}, token_use="access", authz_version=1)
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
