"""Auth dependencies shared by routes and services (no FastAPI app imports)."""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.security import decode_access_token
from app.db.session import get_async_session
from app.models import User, UserRole

security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_async_session),
) -> User:
    payload = decode_access_token(credentials.credentials)
    if not payload or "user_id" not in payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await session.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.id == payload["user_id"], User.is_active == True)
        .execution_options(populate_existing=True)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_active_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User is inactive")
    return user


def require_role(*role_codes: str):
    """Dependency factory: requires at least one of the given roles."""

    async def _check(current_user: User = Depends(get_current_active_user)):
        user_roles = {ur.role.code for ur in current_user.roles if ur.role}
        if not user_roles.intersection(role_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires one of roles: {role_codes}",
            )
        return current_user

    return _check


def has_any_role(user: User, *role_codes: str) -> bool:
    user_roles = {ur.role.code for ur in user.roles if ur.role}
    return bool(user_roles.intersection(role_codes))


def has_role(user: User, code: str) -> bool:
    return any(ur.role and ur.role.code == code for ur in user.roles)
