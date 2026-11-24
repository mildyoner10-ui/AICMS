"""Deleting change requests: soft delete hides it, enforced changes are refused."""

from sqlalchemy import select

from app.models import Change, ChangeStatus
from test_lifecycle import _create, _h, _make_user


async def _manager(session):
    return await _make_user(session, "manager-del", "MANAGER")


async def test_manager_deletes_draft_and_it_leaves_the_list(client, session):
    manager = await _manager(session)
    change = await _create(client, manager)

    deleted = await client.delete(f"/api/v1/changes/{change['id']}", headers=_h(manager))
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["deleted"] is True

    listing = await client.get("/api/v1/changes", headers=_h(manager))
    assert all(c["id"] != change["id"] for c in listing.json()["items"])
    assert (await client.get(f"/api/v1/changes/{change['id']}", headers=_h(manager))).status_code == 404

    # Soft delete keeps the row for audit.
    row = (await session.execute(select(Change).where(Change.id == change["id"]))).scalar_one()
    assert row.deleted_at is not None
    assert str(row.deleted_by_id) == str(manager.id)

    history = await client.get(f"/api/v1/changes/{change['id']}/history", headers=_h(manager))
    actions = [e["action"] for e in history.json()["events"]]
    assert "change.deleted" in actions


async def test_requester_cannot_delete(client, session):
    requester = await _make_user(session, "req-del", "REQUESTER")
    change = await _create(client, requester)
    resp = await client.delete(f"/api/v1/changes/{change['id']}", headers=_h(requester))
    assert resp.status_code == 403


async def test_approved_change_is_refused_not_deleted(client, session):
    manager = await _manager(session)
    change = await _create(client, manager)
    row = (await session.execute(select(Change).where(Change.id == change["id"]))).scalar_one()
    row.status = ChangeStatus.APPROVED
    await session.commit()

    resp = await client.delete(f"/api/v1/changes/{change['id']}", headers=_h(manager))
    assert resp.status_code == 409
    assert "tidak bisa dihapus" in resp.json()["detail"]
    session.expire_all()
    row = (await session.execute(select(Change).where(Change.id == change["id"]))).scalar_one()
    assert row.deleted_at is None


async def test_bulk_delete_reports_refused_ids(client, session):
    manager = await _manager(session)
    draft_a = await _create(client, manager)
    draft_b = await _create(client, manager)
    done = await _create(client, manager)
    row = (await session.execute(select(Change).where(Change.id == done["id"]))).scalar_one()
    row.status = ChangeStatus.COMPLETED
    await session.commit()

    resp = await client.post(
        "/api/v1/changes/bulk-delete",
        json={"change_ids": [draft_a["id"], draft_b["id"], done["id"]]},
        headers=_h(manager),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert set(body["deleted"]) == {draft_a["id"], draft_b["id"]}
    assert [r["id"] for r in body["refused"]] == [done["id"]]
    assert (await client.post("/api/v1/changes/bulk-delete", json={"change_ids": []}, headers=_h(manager))).status_code == 400
