from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status

from app.config import settings
from app.models import AuthContext, Role


def _parse_groups(raw: str | list[str] | None) -> set[Role]:
    if raw is None:
        return set()
    names = raw if isinstance(raw, list) else [g.strip() for g in raw.split(",") if g.strip()]
    parsed: set[Role] = set()
    for name in names:
        for role in Role:
            if role.value == name:
                parsed.add(role)
                break
    return parsed


def _mock_user() -> AuthContext:
    return AuthContext(
        sub="demo-ta-1",
        email="demo.ta@example.com",
        groups={Role.TA},
        token_use="access",
        authz_version=1,
    )


async def get_current_user(request: Request) -> AuthContext:
    if settings.demo_mode:
        return _mock_user()

    claims = (
        request.scope.get("aws.event", {})
        .get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
    )
    if not claims:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing JWT claims")
    token_use = claims.get("token_use")
    if token_use != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Access token required")
    return AuthContext(
        sub=claims["sub"],
        email=claims.get("email"),
        groups=_parse_groups(claims.get("cognito:groups")),
        token_use=token_use,
        authz_version=int(claims.get("custom:authz_version", "0")),
    )


CurrentUser = Depends(get_current_user)

