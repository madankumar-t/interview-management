from fastapi.testclient import TestClient

from app import config
from app.auth import get_current_user
from app.main import app
from app.models import AuthContext, Role
from app.state import local_state


async def _ta_user():
    return AuthContext(sub="demo-ta-1", groups={Role.TA}, token_use="access")


def test_candidates_default_to_active_and_paginate(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(
        local_state,
        "candidates",
        {
            "1": {"candidate_id": "1", "full_name": "A", "email": "a@example.com", "status": "Active"},
            "2": {"candidate_id": "2", "full_name": "B", "email": "b@example.com", "status": "Active"},
            "3": {"candidate_id": "3", "full_name": "C", "email": "c@example.com", "status": "Closed"},
        },
    )
    app.dependency_overrides[get_current_user] = _ta_user
    client = TestClient(app)

    first = client.get("/candidates?page=1&page_size=1")
    closed = client.get("/candidates?lifecycle=closed")

    assert first.status_code == 200
    assert first.json()["total"] == 2
    assert len(first.json()["candidates"]) == 1
    assert closed.json()["total"] == 1
    assert closed.json()["candidates"][0]["status"] == "Closed"
    app.dependency_overrides.clear()


def test_requisitions_default_to_active_and_filter_closed(monkeypatch) -> None:
    monkeypatch.setattr(config.settings, "demo_mode", True)
    monkeypatch.setattr(
        local_state,
        "requisitions",
        {
            "1": {"requisition_id": "1", "title": "A", "status": "Open", "positions_open": 1},
            "2": {"requisition_id": "2", "title": "B", "status": "On Hold", "positions_open": 1},
            "3": {"requisition_id": "3", "title": "C", "status": "Closed", "positions_open": 0},
            "4": {"requisition_id": "4", "title": "D", "status": "Cancelled", "positions_open": 1},
        },
    )
    app.dependency_overrides[get_current_user] = _ta_user
    client = TestClient(app)

    active = client.get("/requisitions?page=1&page_size=1")
    closed = client.get("/requisitions?lifecycle=closed&page=1&page_size=10")

    assert active.status_code == 200
    assert active.json()["total"] == 2
    assert len(active.json()["requisitions"]) == 1
    assert closed.json()["total"] == 2
    assert {item["status"] for item in closed.json()["requisitions"]} == {"Closed", "Cancelled"}
    app.dependency_overrides.clear()