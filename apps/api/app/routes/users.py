import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import get_current_active_user, get_current_user, require_role
from app.core.security import hash_password
from app.db.session import get_async_session
from app.models import AuditActorType, AuditEvent, User, Role, UserRole

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me")
async def get_current_user_info(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_async_session),
):
    result = await session.execute(
        select(User).options(selectinload(User.roles).selectinload(UserRole.role)).where(User.id == user.id)
    )
    u = result.scalar_one()
    return {
        "id": str(u.id),
        "username": u.username,
        "email": u.email,
        "display_name": u.display_name,
        "is_active": u.is_active,
        "auth_provider": u.auth_provider,
        "roles": [ur.role.code for ur in u.roles if ur.role],
    }


@router.get("", dependencies=[Depends(require_role("ADMIN"))])
async def list_users(
    page: int = 1,
    page_size: int = 20,
    session: AsyncSession = Depends(get_async_session),
):
    offset = (page - 1) * page_size
    total = (await session.execute(select(func.count(User.id)))).scalar() or 0

    result = await session.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .order_by(User.created_at)
        .offset(offset)
        .limit(page_size)
    )
    users = result.scalars().all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": str(u.id),
                "username": u.username,
                "email": u.email,
                "display_name": u.display_name,
                "is_active": u.is_active,
                "auth_provider": u.auth_provider,
                "roles": [ur.role.code for ur in u.roles if ur.role],
                "created_at": u.created_at.isoformat() if u.created_at else None,
            }
            for u in users
        ],
    }


class NewUser(BaseModel):
    username: str = Field(min_length=3, max_length=100)
    # ponytail: shape check only, no email-validator dep — delivery is not used in MVP.
    email: str = Field(pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$", max_length=255)
    display_name: str | None = Field(None, max_length=200)
    password: str = Field(min_length=8)
    role_codes: list[str] = Field(default_factory=list)


@router.post("", status_code=201, dependencies=[Depends(require_role("ADMIN"))])
async def create_user(
    body: NewUser,
    session: AsyncSession = Depends(get_async_session),
    admin: User = Depends(get_current_active_user),
):
    duplicate = (
        await session.execute(
            select(User).where((User.username == body.username) | (User.email == body.email))
        )
    ).scalar_one_or_none()
    if duplicate:
        raise HTTPException(status_code=409, detail="Username or email already in use")

    roles = await _resolve_roles(session, body.role_codes)
    user = User(
        username=body.username,
        email=body.email,
        display_name=body.display_name or body.username,
        hashed_password=hash_password(body.password),
        is_active=True,
        auth_provider="local",
    )
    session.add(user)
    await session.flush()
    for role in roles:
        session.add(UserRole(user_id=user.id, role_id=role.id))
    _audit(session, admin.id, "user.created", user.id, {"username": user.username, "roles": body.role_codes})
    await session.commit()
    return {"id": str(user.id), "username": user.username, "roles": body.role_codes}


@router.patch("/{user_id}", dependencies=[Depends(require_role("ADMIN"))])
async def update_user(
    user_id: str,
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    admin: User = Depends(get_current_active_user),
):
    user = await _get_user_or_404(session, user_id)

    if "is_active" in body:
        if user.id == admin.id and body["is_active"] is False:
            raise HTTPException(status_code=400, detail="You cannot disable your own account")
        user.is_active = bool(body["is_active"])
    if body.get("display_name"):
        user.display_name = str(body["display_name"])[:200]
    if body.get("password"):
        if len(str(body["password"])) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        user.hashed_password = hash_password(str(body["password"]))
        # Disabling is enough to invalidate the token: get_current_user filters is_active.

    _audit(session, admin.id, "user.updated", user.id, {k: v for k, v in body.items() if k != "password"})
    await session.commit()
    return {"id": str(user.id), "is_active": user.is_active, "display_name": user.display_name}


@router.delete("/{user_id}", dependencies=[Depends(require_role("ADMIN"))])
async def delete_user(
    user_id: str,
    session: AsyncSession = Depends(get_async_session),
    admin: User = Depends(get_current_active_user),
):
    """Soft delete: audit history and change ownership must keep pointing at a real row."""
    user = await _get_user_or_404(session, user_id)
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    user.is_active = False
    _audit(session, admin.id, "user.deleted", user.id, {"username": user.username})
    await session.commit()
    return {"status": "ok", "user_id": user_id, "is_active": False}


@router.put("/{user_id}/roles", dependencies=[Depends(require_role("ADMIN"))])
async def assign_roles(
    user_id: str,
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    admin: User = Depends(get_current_active_user),
):
    role_codes = body.get("role_codes", [])
    if not isinstance(role_codes, list):
        raise HTTPException(status_code=400, detail="role_codes must be a list")

    user = await _get_user_or_404(session, user_id)
    roles = await _resolve_roles(session, role_codes)

    await session.execute(UserRole.__table__.delete().where(UserRole.user_id == user.id))
    for role in roles:
        session.add(UserRole(user_id=user.id, role_id=role.id))

    _audit(session, admin.id, "user.roles_changed", user.id, {"roles": role_codes})
    await session.commit()
    return {"status": "ok", "user_id": user_id, "roles": role_codes}


@router.get("/roles", dependencies=[Depends(require_role("ADMIN"))])
async def list_roles(session: AsyncSession = Depends(get_async_session)):
    result = await session.execute(select(Role).order_by(Role.code))
    return [
        {"id": str(r.id), "code": r.code, "name": r.name, "description": r.description}
        for r in result.scalars().all()
    ]


async def _get_user_or_404(session: AsyncSession, user_id: str) -> User:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="User not found")
    user = (await session.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _resolve_roles(session: AsyncSession, role_codes: list) -> list[Role]:
    if not role_codes:
        return []
    found = (await session.execute(select(Role).where(Role.code.in_(role_codes)))).scalars().all()
    missing = set(role_codes) - {r.code for r in found}
    if missing:
        raise HTTPException(status_code=400, detail=f"Role not found: {sorted(missing)}")
    return found


def _audit(session: AsyncSession, actor_id, action: str, user_id, event_data: dict) -> None:
    session.add(
        AuditEvent(
            actor_user_id=actor_id,
            actor_type=AuditActorType.USER.value,
            action=action,
            object_type="USER",
            object_id=user_id,
            event_data=event_data,
        )
    )
