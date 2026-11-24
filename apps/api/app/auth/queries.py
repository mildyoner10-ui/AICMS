from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import User, UserRole


async def load_user_with_roles(session: AsyncSession, user_id) -> User | None:
    """Always query with eager-loaded roles so identity-map dedupe never hands
    back an unloaded collection."""
    res = await session.execute(
        select(User)
        .options(selectinload(User.roles).selectinload(UserRole.role))
        .where(User.id == user_id)
        .execution_options(populate_existing=True)
    )
    return res.scalar_one_or_none()
