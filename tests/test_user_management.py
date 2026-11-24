"""User management + RBAC: admin CRUD, role assignment, and the guard rails."""

from sqlalchemy import select

from app.models import Role
from test_lifecycle import _h, _make_user


async def _admin(session):
    user = await _make_user(session, "admin-users", "ADMIN")
    # Each test gets an empty schema; roles are normally seeded by seed.py.
    for code in ("ENGINEER", "REQUESTER", "MANAGER"):
        exists = (await session.execute(select(Role).where(Role.code == code))).scalar_one_or_none()
        if not exists:
            session.add(Role(code=code, name=code.title()))
    await session.commit()
    return user


NEW = {
    "username": "engineer-new",
    "email": "engineer-new@test.local",
    "display_name": "Engineer New",
    "password": "Engineer@123",
    "role_codes": ["ENGINEER", "REQUESTER"],
}


async def test_admin_creates_user_with_roles_and_user_can_login(client, session):
    admin = await _admin(session)
    created = await client.post("/api/v1/users", json=NEW, headers=_h(admin))
    assert created.status_code == 201, created.text
    assert set(created.json()["roles"]) == {"ENGINEER", "REQUESTER"}

    login = await client.post(
        "/api/v1/auth/login", json={"username": NEW["username"], "password": NEW["password"]}
    )
    assert login.status_code == 200, login.text
    assert set(login.json()["user"]["roles"]) == {"ENGINEER", "REQUESTER"}


async def test_duplicate_username_conflicts(client, session):
    admin = await _admin(session)
    first = await client.post("/api/v1/users", json=NEW, headers=_h(admin))
    assert first.status_code == 201, first.text
    second = await client.post("/api/v1/users", json=NEW, headers=_h(admin))
    assert second.status_code == 409


async def test_admin_changes_roles_and_unknown_role_rejected(client, session):
    admin = await _admin(session)
    created = await client.post("/api/v1/users", json=NEW, headers=_h(admin))
    user_id = created.json()["id"]

    changed = await client.put(
        f"/api/v1/users/{user_id}/roles", json={"role_codes": ["MANAGER"]}, headers=_h(admin)
    )
    assert changed.status_code == 200
    listing = await client.get("/api/v1/users?page_size=200", headers=_h(admin))
    row = next(u for u in listing.json()["items"] if u["id"] == user_id)
    assert row["roles"] == ["MANAGER"]

    bad = await client.put(
        f"/api/v1/users/{user_id}/roles", json={"role_codes": ["NOT_A_ROLE"]}, headers=_h(admin)
    )
    assert bad.status_code == 400


async def test_deactivate_blocks_login_and_self_delete_blocked(client, session):
    admin = await _admin(session)
    created = await client.post("/api/v1/users", json=NEW, headers=_h(admin))
    user_id = created.json()["id"]

    deleted = await client.delete(f"/api/v1/users/{user_id}", headers=_h(admin))
    assert deleted.status_code == 200
    login = await client.post(
        "/api/v1/auth/login", json={"username": NEW["username"], "password": NEW["password"]}
    )
    assert login.status_code == 403

    self_delete = await client.delete(f"/api/v1/users/{admin.id}", headers=_h(admin))
    assert self_delete.status_code == 400


async def test_non_admin_cannot_manage_users(client, session):
    requester = await _make_user(session, "requester-users", "REQUESTER")
    assert (await client.get("/api/v1/users", headers=_h(requester))).status_code == 403
    assert (await client.get("/api/v1/users/roles", headers=_h(requester))).status_code == 403
    assert (await client.post("/api/v1/users", json=NEW, headers=_h(requester))).status_code == 403
