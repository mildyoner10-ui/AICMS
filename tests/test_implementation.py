"""Stage 5: scheduling, implementation, outcome, PIR, closure, calendar conflicts."""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import Change, ChangeRevision
from test_lifecycle import REQUIRED_RFC, _h, _make_user


async def _approved_change(client, session):
    """Walk a change through submit + every approval step to APPROVED."""
    requester = await _make_user(session, f"req_{uuid.uuid4().hex[:6]}", "REQUESTER")
    created = (await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=_h(requester))).json()
    submitted = await client.post(f"/api/v1/changes/{created['id']}/submit", headers=_h(requester))
    assert submitted.status_code == 200, submitted.text

    probe = await _make_user(session, f"probe_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")
    inbox = (await client.get("/api/v1/approvals/inbox", headers=_h(probe))).json()
    steps = (
        await client.get(f"/api/v1/approvals/tasks/{inbox['tasks'][0]['id']}", headers=_h(probe))
    ).json()["workflow_steps"]

    for code in [s["step_code"] for s in steps]:
        approver = await _make_user(session, f"{code.lower()}_{uuid.uuid4().hex[:6]}", code)
        task = (await client.get("/api/v1/approvals/inbox", headers=_h(approver))).json()["tasks"][0]
        if not task["actionable"]:
            continue
        decision = await client.post(
            f"/api/v1/approvals/tasks/{task['id']}/decision", json={"decision": "APPROVE"}, headers=_h(approver)
        )
        assert decision.status_code == 200, decision.text

    detail = (await client.get(f"/api/v1/changes/{created['id']}", headers=_h(requester))).json()
    assert detail["status"] == "APPROVED", detail
    return created, requester


def _window(hours_from_now=1, length_hours=2):
    start = datetime.now(timezone.utc) + timedelta(hours=hours_from_now)
    return start.isoformat(), (start + timedelta(hours=length_hours)).isoformat()


async def _schedule(client, change, cm, start=None, end=None, reason="jendela uji"):
    start = start or _window()[0]
    end = end or _window()[1]
    return await client.post(
        f"/api/v1/changes/{change['id']}/schedule",
        json={"start": start, "end": end, "reason": reason},
        headers=_h(cm),
    )


class TestScheduling:
    async def test_schedule_requires_change_manager(self, client, session):
        change, requester = await _approved_change(client, session)
        resp = await _schedule(client, change, requester)
        assert resp.status_code == 403, resp.text

    async def test_schedule_sets_window_and_status(self, client, session):
        change, _ = await _approved_change(client, session)
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        resp = await _schedule(client, change, cm)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["status"] == "SCHEDULED"
        assert body["implementation_start"] and body["implementation_end"]

    async def test_schedule_rejects_end_before_start(self, client, session):
        change, _ = await _approved_change(client, session)
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        start, end = _window()
        resp = await _schedule(client, change, cm, start=end, end=start)
        assert resp.status_code == 409, resp.text

    async def test_schedule_requires_timezone(self, client, session):
        change, _ = await _approved_change(client, session)
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        resp = await _schedule(client, change, cm, start="2027-01-01T01:00:00", end="2027-01-01T02:00:00")
        assert resp.status_code == 400, resp.text

    async def test_unapproved_change_cannot_be_scheduled(self, client, session):
        requester = await _make_user(session, f"req_{uuid.uuid4().hex[:6]}", "REQUESTER")
        created = (await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=_h(requester))).json()
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        resp = await _schedule(client, created, cm)
        assert resp.status_code == 409, resp.text


class TestImplementationAndPir:
    async def _scheduled(self, client, session):
        change, requester = await _approved_change(client, session)
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        scheduled = await _schedule(client, change, cm)
        assert scheduled.status_code == 200, scheduled.text
        return change, requester, cm

    async def test_start_creates_record_and_moves_in_progress(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        started = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/start", json={"notes": "mulai"}, headers=_h(cm)
        )
        assert started.status_code == 201, started.text
        record = started.json()["record"]
        assert record["actual_start"] and record["implementer_id"]
        status = (await client.get(f"/api/v1/changes/{change['id']}", headers=_h(cm))).json()["status"]
        assert status == "IN_PROGRESS"

    async def test_outcome_successful_moves_to_validation(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        await client.post(f"/api/v1/changes/{change['id']}/implementation/start", json={}, headers=_h(cm))
        outcome = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/outcome",
            json={"outcome": "SUCCESSFUL", "notes": "selesai", "post_check_passed": True, "evidence": ["ping ok"]},
            headers=_h(cm),
        )
        assert outcome.status_code == 200, outcome.text
        assert outcome.json()["record"]["actual_end"] is not None
        assert (await client.get(f"/api/v1/changes/{change['id']}", headers=_h(cm))).json()["status"] == "VALIDATION"

    async def test_rolled_back_outcome_sets_flag_and_status(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        await client.post(f"/api/v1/changes/{change['id']}/implementation/start", json={}, headers=_h(cm))
        outcome = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/outcome",
            json={"outcome": "ROLLED_BACK", "notes": "gagal verifikasi"},
            headers=_h(cm),
        )
        assert outcome.status_code == 200, outcome.text
        assert outcome.json()["record"]["rollback_performed"] is True
        assert (await client.get(f"/api/v1/changes/{change['id']}", headers=_h(cm))).json()["status"] == "ROLLED_BACK"

    async def test_unknown_outcome_rejected(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        await client.post(f"/api/v1/changes/{change['id']}/implementation/start", json={}, headers=_h(cm))
        resp = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/outcome",
            json={"outcome": "PROBABLY_FINE"},
            headers=_h(cm),
        )
        assert resp.status_code == 422, resp.text

    async def test_pir_completes_then_close(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        await client.post(f"/api/v1/changes/{change['id']}/implementation/start", json={}, headers=_h(cm))
        await client.post(
            f"/api/v1/changes/{change['id']}/implementation/outcome",
            json={"outcome": "SUCCESSFUL", "post_check_passed": True},
            headers=_h(cm),
        )
        pir = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/pir",
            json={"notes": "layanan normal 24 jam", "post_check_passed": True, "service_validation": "monitoring hijau"},
            headers=_h(cm),
        )
        assert pir.status_code == 200, pir.text
        assert pir.json()["status"] == "COMPLETED"

        record = (await client.get(f"/api/v1/changes/{change['id']}/implementation", headers=_h(cm))).json()["record"]
        assert record["postcheck"]["pir_notes"] == "layanan normal 24 jam"

        closed = await client.post(f"/api/v1/changes/{change['id']}/implementation/close", json={}, headers=_h(cm))
        assert closed.status_code == 200, closed.text
        assert closed.json()["status"] == "CLOSED"

    async def test_pir_requires_notes(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        await client.post(f"/api/v1/changes/{change['id']}/implementation/start", json={}, headers=_h(cm))
        await client.post(
            f"/api/v1/changes/{change['id']}/implementation/outcome",
            json={"outcome": "SUCCESSFUL"},
            headers=_h(cm),
        )
        pir = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/pir", json={"notes": "  "}, headers=_h(cm)
        )
        assert pir.status_code in (409, 422), pir.text

    async def test_failed_post_check_never_completes(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        await client.post(f"/api/v1/changes/{change['id']}/implementation/start", json={}, headers=_h(cm))
        await client.post(
            f"/api/v1/changes/{change['id']}/implementation/outcome",
            json={"outcome": "SUCCESSFUL"},
            headers=_h(cm),
        )
        pir = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/pir",
            json={"notes": "gagal", "post_check_passed": False},
            headers=_h(cm),
        )
        assert pir.status_code == 409, pir.text
        assert (await client.get(f"/api/v1/changes/{change['id']}", headers=_h(cm))).json()["status"] == "VALIDATION"

    async def test_outcome_requires_started_implementation(self, client, session):
        change, _, cm = await self._scheduled(client, session)
        resp = await client.post(
            f"/api/v1/changes/{change['id']}/implementation/outcome",
            json={"outcome": "SUCCESSFUL"},
            headers=_h(cm),
        )
        assert resp.status_code == 409, resp.text


class TestCalendar:
    async def test_window_listed_with_filters(self, client, session):
        change, _ = await _approved_change(client, session)
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        await _schedule(client, change, cm)

        start, end = _window(hours_from_now=1, length_hours=4)
        listed = await client.get(
            "/api/v1/calendar/changes",
            params={"from": start, "to": end, "status": "SCHEDULED"},
            headers=_h(cm),
        )
        assert listed.status_code == 200, listed.text
        assert any(item["id"] == change["id"] for item in listed.json()["items"])

        filtered = await client.get(
            "/api/v1/calendar/changes",
            params={"from": start, "to": end, "environment": "PRODUCTION"},
            headers=_h(cm),
        )
        assert all(i["environment"] == "PRODUCTION" for i in filtered.json()["items"])

    async def test_draft_not_on_calendar(self, client, session):
        requester = await _make_user(session, f"req_{uuid.uuid4().hex[:6]}", "REQUESTER")
        created = (await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=_h(requester))).json()
        start, end = _window()
        items = (
            await client.get("/api/v1/calendar/changes", params={"from": start, "to": end}, headers=_h(requester))
        ).json()["items"]
        assert all(i["id"] != created["id"] for i in items)

    async def test_shared_device_reported_as_conflict(self, client, session):
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        start_ts, end_ts = _window(hours_from_now=1, length_hours=4)
        start = datetime.fromisoformat(start_ts)
        end = datetime.fromisoformat(end_ts)

        for _ in range(2):
            body = {**REQUIRED_RFC, "affected_devices": ["core-sw-01"]}
            created = (await client.post("/api/v1/changes", json=body, headers=_h(cm))).json()
            # Put both on the calendar with overlapping windows.
            db_change = (await session.execute(select(Change).where(Change.id == created["id"]))).scalar_one()
            db_change.status = "SCHEDULED"
            db_change.implementation_start = start
            db_change.implementation_end = end
        await session.commit()

        result = await client.get(
            "/api/v1/calendar/conflicts", params={"from": start_ts, "to": end_ts}, headers=_h(cm)
        )
        assert result.status_code == 200, result.text
        body = result.json()
        assert body["verdict"] == "CONFLICT"
        assert any("core-sw-01" in c["shared_devices"] for c in body["conflicts"])

    async def test_unrelated_devices_have_no_conflict(self, client, session):
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        start_ts, end_ts = _window(hours_from_now=1, length_hours=4)
        start = datetime.fromisoformat(start_ts)
        end = datetime.fromisoformat(end_ts)

        for device in ("core-sw-01", "edge-rt-02"):
            body = {**REQUIRED_RFC, "affected_devices": [device]}
            created = (await client.post("/api/v1/changes", json=body, headers=_h(cm))).json()
            db_change = (await session.execute(select(Change).where(Change.id == created["id"]))).scalar_one()
            db_change.status = "SCHEDULED"
            db_change.implementation_start = start
            db_change.implementation_end = end
        await session.commit()

        body = (
            await client.get("/api/v1/calendar/conflicts", params={"from": start_ts, "to": end_ts}, headers=_h(cm))
        ).json()
        assert body["verdict"] == "NO_CONFLICT"
        assert body["conflicts"] == []

    async def test_missing_dependency_data_is_indeterminate(self, client, session):
        change, _ = await _approved_change(client, session)
        cm = await _make_user(session, f"cm_{uuid.uuid4().hex[:6]}", "CHANGE_MANAGER")
        await _schedule(client, change, cm)

        start, end = _window(hours_from_now=1, length_hours=4)
        body = (
            await client.get("/api/v1/calendar/conflicts", params={"from": start, "to": end}, headers=_h(cm))
        ).json()
        assert body["verdict"] == "INDETERMINATE"
        assert body["conflicts"] == []
        assert body["changes_without_dependency_data"]


class TestGateDuringScheduling:
    async def test_stale_approval_blocks_start(self, client, session):
        # Build two revisions: approve the first, then resubmit a changed RFC.
        requester = await _make_user(session, f"req_{uuid.uuid4().hex[:6]}", "REQUESTER")
        created = (await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=_h(requester))).json()

        probe = await _make_user(session, f"probe_{uuid.uuid4().hex[:6]}", "TECH_REVIEWER")
        await client.post(f"/api/v1/changes/{created['id']}/submit", headers=_h(requester))
        task = (await client.get("/api/v1/approvals/inbox", headers=_h(probe))).json()["tasks"][0]
        await client.post(
            f"/api/v1/approvals/tasks/{task['id']}/decision", json={"decision": "REQUEST_REVISION", "comment": "ubah"},
            headers=_h(probe),
        )
        await client.post(f"/api/v1/changes/{created['id']}/reopen", headers=_h(requester))
        await client.patch(
            f"/api/v1/changes/{created['id']}",
            json={"title": "Judul direvisi untuk uji gate"},
            headers=_h(requester),
        )
        await client.post(f"/api/v1/changes/{created['id']}/submit", headers=_h(requester))

        db_change = (await session.execute(select(Change).where(Change.id == created["id"]))).scalar_one()
        revisions = (
            await session.execute(select(ChangeRevision).where(ChangeRevision.change_id == db_change.id))
        ).scalars().all()
        assert len(revisions) >= 2
        current = next(r for r in revisions if r.is_current)
        approved = next(r for r in revisions if r.id != current.id)
        db_change.approved_revision_id = approved.id
        await session.commit()

        gate = (await client.get(f"/api/v1/changes/{created['id']}/execution-gate", headers=_h(requester))).json()
        assert gate["ready"] is False
        assert any("revision" in r for r in gate["blocking_reasons"])
