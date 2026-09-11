from app.auth import _parse_groups
from app.models import Role


def test_parse_groups_handles_api_gateway_bracket_serialization() -> None:
    # API Gateway's HTTP API JWT authorizer serializes array claims like cognito:groups
    # as "[Administrator]" / "[Administrator Manager]" instead of JSON or CSV.
    assert _parse_groups("[Administrator]") == {Role.ADMINISTRATOR}
    assert _parse_groups("[Administrator Manager]") == {Role.ADMINISTRATOR, Role.MANAGER}


def test_parse_groups_handles_csv_and_list() -> None:
    assert _parse_groups("Administrator,Manager") == {Role.ADMINISTRATOR, Role.MANAGER}
    assert _parse_groups(["Administrator", "TA"]) == {Role.ADMINISTRATOR, Role.TA}


def test_parse_groups_handles_none_and_empty() -> None:
    assert _parse_groups(None) == set()
    assert _parse_groups("") == set()
    assert _parse_groups("[]") == set()
