from app.models import AuthContext, Role
from app.permissions import Capability, ScopeContext, can_access_interview_record, has_capability


def test_panel_cannot_access_other_panel_interview() -> None:
    user = AuthContext(sub="panel-a", groups={Role.PANEL}, token_use="access", authz_version=1)
    allowed = can_access_interview_record(
        user,
        ScopeContext(department="Engineering", project="Core", panel_subs={"panel-b"}, manager_scopes=set(), actor_sub="panel-a"),
    )
    assert not allowed
    assert has_capability(user, Capability.MANAGE_AVAILABILITY)
    assert has_capability(user, Capability.SUBMIT_FEEDBACK)
    assert not has_capability(user, Capability.ASSIGN_INTERVIEWS)
    assert not has_capability(user, Capability.VIEW_REPORTS)
    assert not has_capability(user, Capability.VIEW_AUDIT)


def test_manager_scope_restricted() -> None:
    user = AuthContext(sub="manager-1", groups={Role.MANAGER}, token_use="access", authz_version=1)
    blocked = can_access_interview_record(
        user,
        ScopeContext(
            department="Finance",
            project="ERP",
            panel_subs={"panel-a"},
            manager_scopes={"Engineering#Core"},
            actor_sub="manager-1",
        ),
    )
    assert not blocked
    assert has_capability(user, Capability.MANAGE_USERS)
    assert has_capability(user, Capability.MANAGE_CANDIDATES)
    assert has_capability(user, Capability.MANAGE_SCHEDULING)
    assert has_capability(user, Capability.VIEW_REPORTS)
    assert has_capability(user, Capability.VIEW_AUDIT)


def test_ta_can_view_all() -> None:
    user = AuthContext(sub="ta-1", groups={Role.TA}, token_use="access", authz_version=1)
    assert can_access_interview_record(
        user,
        ScopeContext(department="Any", project="Any", panel_subs={"x"}, manager_scopes=set(), actor_sub="ta-1"),
    )
    assert has_capability(user, Capability.ASSIGN_INTERVIEWS)
    assert not has_capability(user, Capability.MANAGE_SCHEDULING)
