"""Auth routes: login, token issuance, profile management."""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_user
from app.auth.queries import load_user_with_roles
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_async_session
from app.models import User, UserRole

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


def role_codes(user: User) -> list[str]:
    return [ur.role.code for ur in user.roles if ur.role]


@router.post("/login", response_model=LoginResponse)
async def login(body: dict, session: AsyncSession = Depends(get_async_session)):
    from app.core.config import settings

    if not settings.allow_local_login:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Local login disabled")

    username = body.get("username", "")
    password = body.get("password", "")

    result = await session.execute(
        select(User).options(selectinload(User.roles).selectinload(UserRole.role)).where(User.username == username)
    )
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    codes = role_codes(user)
    token = create_access_token({"user_id": str(user.id), "username": user.username, "roles": codes})
    return LoginResponse(
        access_token=token,
        expires_in=settings.jwt_expire_minutes * 60,
        user={"id": str(user.id), "username": user.username, "display_name": user.display_name, "roles": codes},
    )


@router.get("/me")
async def get_me(user: User = Depends(get_current_user), session: AsyncSession = Depends(get_async_session)):
    u = await load_user_with_roles(session, user.id)
    return {
        "id": str(u.id),
        "username": u.username,
        "email": u.email,
        "display_name": u.display_name,
        "is_active": u.is_active,
        "auth_provider": u.auth_provider,
        "roles": role_codes(u),
    }


class ProfileUpdate(BaseModel):
    display_name: str | None = None
    email: str | None = None
    old_password: str | None = None
    new_password: str | None = None


@router.post("/debug/body", response_model=dict)
async def debug_body(body: dict):
    """Debug endpoint: echo back the received body."""
    return {"received": body}


@router.patch("/me", response_model=dict)
async def update_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None

    if body.email is not None:
        email = body.email.strip().lower()
        duplicate = (
            await session.execute(
                select(User).where(User.email == email, User.id != user.id)
            )
        ).scalar_one_or_none()
        if duplicate:
            raise HTTPException(status_code=409, detail="Email sudah digunakan pengguna lain")
        user.email = email

    if body.new_password:
        if not body.old_password:
            raise HTTPException(status_code=400, detail="Password lama diperlukan untuk mengubah password")
        if not verify_password(body.old_password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Password lama salah")
        user.hashed_password = hash_password(body.new_password)

    session.add(user)
    await session.commit()
    await session.refresh(user)

    return {
        "id": str(user.id),
        "username": user.username,
        "email": user.email,
        "display_name": user.display_name,
        "roles": role_codes(user),
    }
