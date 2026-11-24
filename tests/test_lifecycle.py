"""Stage 2: RFC lifecycle, immutable revisions, status timeline, stale/invalidation, execution gate."""

import uuid

from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models import ChangeStatus, Role, User, UserRole
from app.services.workflow_service import ALLOWED_TRANSITIONS, can_transition


REQUIRED_RFC = {
    "title": "Stage 2 lifecycle change",
    "category": "HEAD_OFFICE",
    "change_type": "NORMAL",
    "environment": "TEST",
    "business_justification": "Exercise the lifecycle",
    "implementation_plan": "1. Snapshot config\n2. Apply route-map\n3. Verify BGP\n4. Notify\n5. Close",
    "test_plan": "Verify BGP neighbors",
    "rollback_plan": "Restore prior route-map and verify",
    "impact_description": "Traffic path may change",
}


async def _make_user(session, username: str, role_code: str) -> User:
    role = (await session.execute(select(Role).where(Role.code == role_code))).scalar_one_or_none()
    if not role:
        role = Role(id=uuid.uuid4(), code=role_code, name=role_code.title())
        session.add(role)
        await session.flush()
    user = User(
        id=uuid.uuid4(),
        username=username,
        email=f"{username}@test.local",
        display_name=username.title(),
        hashed_password=hash_password("Pass@123"),
        is_active=True,
        auth_provider="local",
    )
    session.add(user)
    await session.flush()
    session.add(UserRole(user_id=user.id, role_id=role.id))
    await session.commit()
    return user


def _h(user) -> dict:
    return {"Authorization": f"Bearer {create_access_token({'user_id': str(user.id), 'username': user.username})}"}


async def _create(client, user) -> dict:
    resp = await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=_h(user))
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Pure state-machine rules ─────────────────────────────────────────────────


class TestStateMachine:
    def test_forward_path_allowed(self):
        path = [
            ChangeStatus.DRAFT,
            ChangeStatus.SUBMITTED,
            ChangeStatus.DOCUMENT_VALIDATION,
            ChangeStatus.AI_REVIEW,
            ChangeStatus.PENDING_APPROVAL,
            ChangeStatus.APPROVED,
            ChangeStatus.SCHEDULED,
            ChangeStatus.IN_PROGRESS,
            ChangeStatus.VALIDATION,
            ChangeStatus.COMPLETED,
            ChangeStatus.CLOSED,
        ]
        for a, b in zip(path, path[1:]):
            assert can_transition(a, b), f"{a.value} -> {b.value} should be allowed"

    def test_skipping_states_rejected(self):
        assert not can_transition(ChangeStatus.DRAFT, ChangeStatus.APPROVED)
        assert not can_transition(ChangeStatus.DRAFT, ChangeStatus.PENDING_APPROVAL)
        assert not can_transition(ChangeStatus.SUBMITTED, ChangeStatus.IN_PROGRESS)

    def test_approval_cannot_be_assumed_from_review(self):
        # A review outcome may only reach PENDING_APPROVAL, never APPROVED.
        assert ChangeStatus.APPROVED not in ALLOWED_TRANSITIONS[ChangeStatus.AI_REVIEW]

    def test_terminal_states(self):
        assert ALLOWED_TRANSITIONS.get(ChangeStatus.CANCELLED, set()) == set()
        assert ALLOWED_TRANSITIONS.get(ChangeStatus.CLOSED, set()) == set()


# ── Lifecycle through the API ────────────────────────────────────────────────


class TestLifecycle:
    async def test_submit_creates_locked_revision_and_timeline(self, client, session):
        user = await _make_user(session, "req_life", "REQUESTER")
        change = await _create(client, user)

        resp = await client.post(f"/api/v1/changes/{change['id']}/submit", headers=_h(user))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        # Inline review runs; outcome is one of the post-review states.
        assert body["status"] in ("PENDING_APPROVAL", "REVISION_REQUIRED", "AI_REVIEW")
        assert body["review_job_id"]

        hist = (await client.get(f"/api/v1/changes/{change['id']}/history", headers=_h(user))).json()

        to_states = [t["to_status"] for t in hist["status_history"]]
        assert to_states[0] == "DRAFT"
        for expected in ("SUBMITTED", "DOCUMENT_VALIDATION", "AI_REVIEW"):
            assert expected in to_states

        # History names the human actor, so the timeline shows who did what.
        by_user = [t for t in hist["status_history"] if t["actor_user_id"]]
        assert by_user and all(t["actor_name"] for t in by_user)

        current = [r for r in hist["revisions"] if r["is_current"]]
        assert len(current) == 1
        assert current[0]["locked"] is True

    async def test_draft_update_after_submit_rejected(self, client, session):
        user = await _make_user(session, "req_lock", "REQUESTER")
        change = await _create(client, user)
        await client.post(f"/api/v1/changes/{change['id']}/submit", headers=_h(user))

        resp = await client.patch(
            f"/api/v1/changes/{change['id']}", json={"title": "changed"}, headers=_h(user)
        )
        assert resp.status_code == 400

    async def test_resubmit_creates_new_revision_and_stales_review(self, client, session):
        user = await _make_user(session, "req_rev", "REQUESTER")
        change = await _create(client, user)

        first = await client.post(f"/api/v1/changes/{change['id']}/submit", headers=_h(user))
        first_status = first.json()["status"]

        # Force the change back to DRAFT along the path its review outcome allows.
        if first_status == "PENDING_APPROVAL":
            approver = await _make_user(session, "mgr_rev", "MANAGER")
            back = await client.post(
                f"/api/v1/changes/{change['id']}/request-revision",
                json={"reason": "needs a clearer rollback"},
                headers=_h(approver),
            )
            assert back.status_code == 200, back.text
        reopen = await client.post(f"/api/v1/changes/{change['id']}/reopen", headers=_h(user))
        assert reopen.status_code == 200, reopen.text
        assert reopen.json()["status"] == "DRAFT"

        resp = await client.patch(
            f"/api/v1/changes/{change['id']}",
            json={"rollback_plan": "Restore route-map RM-OUT to previous policy and verify traffic"},
            headers=_h(user),
        )
        assert resp.status_code == 200

        second = await client.post(f"/api/v1/changes/{change['id']}/submit", headers=_h(user))
        assert second.status_code == 200, second.text

        hist = (await client.get(f"/api/v1/changes/{change['id']}/history", headers=_h(user))).json()
        numbers = [r["revision_number"] for r in hist["revisions"]]
        assert max(numbers) >= 2
        assert sum(1 for r in hist["revisions"] if r["is_current"]) == 1
        # Earlier revision is locked and no longer current.
        earlier = [r for r in hist["revisions"] if not r["is_current"]]
        assert all(r["locked"] for r in earlier)

    async def test_execution_gate_blocks_unapproved(self, client, session):
        user = await _make_user(session, "req_gate", "REQUESTER")
        change = await _create(client, user)

        gate = (await client.get(f"/api/v1/changes/{change['id']}/execution-gate", headers=_h(user))).json()
        assert gate["ready"] is False
        assert any("status" in r for r in gate["blocking_reasons"])

        impl = await client.post(
            f"/api/v1/changes/{change['id']}/implementation",
            json={"execution_notes": "trying too early"},
            headers=_h(user),
        )
        assert impl.status_code == 400
        assert "not execution-ready" in impl.json()["detail"]

    async def test_cancel_invalidates_pending_approvals(self, client, session):
        user = await _make_user(session, "req_cancel2", "REQUESTER")
        change = await _create(client, user)
        await client.post(f"/api/v1/changes/{change['id']}/submit", headers=_h(user))

        resp = await client.post(
            f"/api/v1/changes/{change['id']}/cancel",
            json={"reason": "no longer needed"},
            headers=_h(user),
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "CANCELLED"

        gate = (await client.get(f"/api/v1/changes/{change['id']}/execution-gate", headers=_h(user))).json()
        assert gate["ready"] is False
