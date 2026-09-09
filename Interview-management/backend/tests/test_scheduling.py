from app.scheduling import InMemoryScheduleStore, SchedulingConflictError, SchedulingService


def test_concurrent_double_booking_prevented() -> None:
    service = SchedulingService(InMemoryScheduleStore())
    payload = {
        "candidate_id": "c1",
        "requisition_id": "r1",
        "department": "Engineering",
        "project": "Core",
        "panel_subs": ["p1"],
        "lead_panel_sub": "p1",
        "start_local_iso": "2026-12-01T10:00:00+05:30",
        "end_local_iso": "2026-12-01T11:00:00+05:30",
        "timezone": "Asia/Kolkata",
        "idempotency_key": "a-1",
    }
    service.schedule(payload)
    payload2 = {**payload, "candidate_id": "c2", "idempotency_key": "a-2"}
    try:
        service.schedule(payload2)
        assert False, "Expected conflict"
    except SchedulingConflictError:
        assert True


def test_reschedule_preserves_history() -> None:
    store = InMemoryScheduleStore()
    service = SchedulingService(store)
    created = service.schedule(
        {
            "candidate_id": "c1",
            "requisition_id": "r1",
            "department": "Engineering",
            "project": "Core",
            "panel_subs": ["p1"],
            "lead_panel_sub": "p1",
            "start_local_iso": "2026-12-01T10:00:00+05:30",
            "end_local_iso": "2026-12-01T11:00:00+05:30",
            "timezone": "Asia/Kolkata",
            "idempotency_key": "k1",
        }
    )
    updated = service.reschedule(
        created.interview_id,
        {
            "start_local_iso": "2026-12-01T12:00:00+05:30",
            "end_local_iso": "2026-12-01T13:00:00+05:30",
            "timezone": "Asia/Kolkata",
            "reason": "Panel request",
            "expected_version": 1,
            "idempotency_key": "k2",
        },
    )
    assert updated.version == 2
    assert len(updated.history) == 1


def test_dst_boundary_valid() -> None:
    service = SchedulingService(InMemoryScheduleStore())
    created = service.schedule(
        {
            "candidate_id": "c1",
            "requisition_id": "r1",
            "department": "Engineering",
            "project": "Core",
            "panel_subs": ["p1"],
            "lead_panel_sub": "p1",
            "start_local_iso": "2026-03-08T01:30:00-05:00",
            "end_local_iso": "2026-03-08T03:30:00-04:00",
            "timezone": "America/New_York",
            "idempotency_key": "dst-1",
        }
    )
    assert created.end_utc > created.start_utc

