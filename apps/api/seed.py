"""Seed script: creates default roles and demo users for development."""

import asyncio
import uuid
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import async_session_factory
from app.models import Role, User, UserRole, UserRoleCode


ROLES = [
    (UserRoleCode.ADMIN.value, "Administrator", "Full system access"),
    (UserRoleCode.REQUESTER.value, "Requester", "Can create and manage RFCs"),
    (UserRoleCode.ENGINEER.value, "Engineer", "Can implement changes"),
    (UserRoleCode.TECH_REVIEWER.value, "Technical Reviewer", "Can review technical details"),
    (UserRoleCode.MANAGER.value, "Manager", "Approve changes"),
    (UserRoleCode.CHANGE_MANAGER.value, "Change Manager", "Manage change process"),
    (UserRoleCode.CAB_MEMBER.value, "CAB Member", "CAB review and approval"),
    (UserRoleCode.FINAL_APPROVER.value, "Final Approver", "Final change approval"),
    (UserRoleCode.AUDITOR.value, "Auditor", "Read-only audit access"),
    (UserRoleCode.AI_ADMIN.value, "AI Administrator", "Manage AI provider and rules"),
]

DEMO_USERS = [
    ("admin", "admin@aicms.local", "Administrator", "Admin@123", ["ADMIN"]),
    ("requester1", "requester1@aicms.local", "Requester One", "Request@123", ["REQUESTER"]),
    ("reviewer1", "reviewer1@aicms.local", "Reviewer One", "Reviewer@123", ["TECH_REVIEWER", "ENGINEER"]),
    ("manager1", "manager1@aicms.local", "Manager One", "Manager@123", ["MANAGER"]),
    ("cm1", "cm@aicms.local", "Change Manager One", "CM@123", ["CHANGE_MANAGER"]),
    ("auditor1", "auditor1@aicms.local", "Auditor One", "Auditor@123", ["AUDITOR"]),
]


async def seed():
    async with async_session_factory() as session:
        existing_roles = (await session.execute(select(Role))).scalars().all()
        roles = {r.code: r for r in existing_roles}
        for code, name, desc in ROLES:
            if code not in roles:
                roles[code] = Role(id=uuid.uuid4(), code=code, name=name, description=desc)
                session.add(roles[code])
        await session.flush()

        for username, email, display, password, codes in DEMO_USERS:
            user = (await session.execute(select(User).where(User.username == username))).scalar_one_or_none()
            if not user:
                user = User(
                    id=uuid.uuid4(),
                    username=username,
                    email=email,
                    display_name=display,
                    hashed_password=hash_password(password),
                    is_active=True,
                    auth_provider="local",
                    created_at=datetime.now(timezone.utc),
                )
                session.add(user)
                await session.flush()

            current = {
                ur.role.code
                for ur in (await session.execute(select(UserRole).where(UserRole.user_id == user.id))).scalars().all()
                if ur.role
            }
            for code in codes:
                if code not in current:
                    session.add(UserRole(user_id=user.id, role_id=roles[code].id))

        await session.commit()
        print("Seed completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
