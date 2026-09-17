from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from app.models import AuthContext, Role


class Capability(StrEnum):
    MANAGE_USERS = "manage_users"
    MANAGE_SETTINGS = "manage_settings"
    VIEW_INTERVIEWS = "view_interviews"
    ASSIGN_INTERVIEWS = "assign_interviews"
    MANAGE_CANDIDATES = "manage_candidates"
    MANAGE_SCHEDULING = "manage_scheduling"
    SUBMIT_FEEDBACK = "submit_feedback"
    RECORD_DECISION = "record_decision"
    VIEW_REPORTS = "view_reports"
    VIEW_AUDIT = "view_audit"
    MANAGE_AVAILABILITY = "manage_availability"


ROLE_CAPABILITIES: dict[Role, set[Capability]] = {
    Role.ADMINISTRATOR: set(Capability),
    Role.MANAGER: {
        Capability.MANAGE_USERS,
        Capability.VIEW_INTERVIEWS,
        Capability.ASSIGN_INTERVIEWS,
        Capability.MANAGE_CANDIDATES,
        Capability.MANAGE_SCHEDULING,
        Capability.SUBMIT_FEEDBACK,
        Capability.RECORD_DECISION,
        Capability.VIEW_REPORTS,
        Capability.VIEW_AUDIT,
        Capability.MANAGE_AVAILABILITY,
    },
    Role.TA: {
        Capability.VIEW_INTERVIEWS,
        Capability.ASSIGN_INTERVIEWS,
        Capability.SUBMIT_FEEDBACK,
    },
    Role.PANEL: {
        Capability.VIEW_INTERVIEWS,
        Capability.SUBMIT_FEEDBACK,
        Capability.VIEW_REPORTS,
        Capability.VIEW_AUDIT,
        Capability.MANAGE_AVAILABILITY,
    },
}


@dataclass(frozen=True)
class ScopeContext:
    department: str | None = None
    project: str | None = None
    panel_subs: set[str] | None = None
    actor_sub: str | None = None
    manager_scopes: set[str] | None = None


def has_capability(user: AuthContext, capability: Capability) -> bool:
    return any(capability in ROLE_CAPABILITIES.get(role, set()) for role in user.groups)


def can_access_interview_record(user: AuthContext, scope: ScopeContext) -> bool:
    if Role.ADMINISTRATOR in user.groups or Role.TA in user.groups:
        return True
    if Role.PANEL in user.groups and scope.panel_subs and user.sub in scope.panel_subs:
        return True
    if Role.MANAGER in user.groups and scope.manager_scopes:
        key = f"{scope.department}#{scope.project}"
        return key in scope.manager_scopes
    return False
