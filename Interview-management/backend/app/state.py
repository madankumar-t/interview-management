from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.scheduling import InMemoryScheduleStore, SchedulingService


@dataclass
class LocalState:
    users: dict[str, dict[str, Any]] = field(
        default_factory=lambda: {
            "demo-admin-1": {"sub": "demo-admin-1", "groups": ["Administrator"], "status": "ACTIVE", "authz_version": 1},
            "demo-ta-1": {"sub": "demo-ta-1", "groups": ["TA"], "status": "ACTIVE", "authz_version": 1},
            "demo-panel-1": {"sub": "demo-panel-1", "groups": ["Panel"], "status": "ACTIVE", "authz_version": 1},
            "demo-manager-1": {"sub": "demo-manager-1", "groups": ["Manager"], "status": "ACTIVE", "authz_version": 1},
        }
    )
    manager_scopes: dict[str, set[str]] = field(default_factory=lambda: {"demo-manager-1": {"Engineering#Core"}})
    candidates: dict[str, dict[str, Any]] = field(default_factory=dict)
    requisitions: dict[str, dict[str, Any]] = field(default_factory=dict)
    feedback: dict[str, dict[str, Any]] = field(default_factory=dict)
    audit: list[dict[str, Any]] = field(default_factory=list)
    scheduling_store: InMemoryScheduleStore = field(default_factory=InMemoryScheduleStore)

    @property
    def scheduling_service(self) -> SchedulingService:
        return SchedulingService(self.scheduling_store)


local_state = LocalState()

