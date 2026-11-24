"""Reviewer verification of an AI result: accept into approval, or return for revision.

Only the REVIEWER role may decide, the AI output is never rewritten, open
HIGH/CRITICAL findings cannot be overridden, and every decision is audited.
"""

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models import AuditEvent, Change, ChangeStatus, Finding, FindingSeverity, FindingStatus, ReviewJob
from test_lifecycle import REQUIRED_RFC, _h, _make_user


async def _change_with_review(client, session, status: ChangeStatus = ChangeStatus.AI_REVIEW) -> tuple[str, dict, str]:
    """A submitted change parked in AI_REVIEW with a completed mock review."""
    requester = await _make_user(session, f"req_{__import__('uuid').uuid4().hex[:6]}", "REQUESTER")
    created = (await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=_h(requester))).json()
    submitted = await client.post(f"/api/v1/changes/{created['id']}/submit", json={}, headers=_h(requester))
    assert submitted.status_code == 200, submitted.text
    # The inline review already evaluated the outcome; force the state this test needs.
    change = (await session.execute(select(Change).where(Change.id == created["id"]))).scalar_one()
    change.status = status
    await session.commit()
    review_id = submitted.json()["review_job_id"]
    return created["id"], _h(requester), review_id


async def _decide(client, change_id: str, review_id: str, headers: dict, body: dict):
    return await client.post(f"/api/v1/changes/{change_id}/reviews/{review_id}/decision", json=body, headers=headers)


async def _add_blocker(session, review_id: str) -> None:
    job = (
        await session.execute(select(ReviewJob).options(selectinload(ReviewJob.result)).where(ReviewJob.id == review_id))
    ).scalar_one()
    session.add(
        Finding(
            review_result_id=job.result.id,
            check_category="ROLLBACK",
            check_name="test_blocker",
            status=FindingStatus.FAIL,
            severity=FindingSeverity.CRITICAL,
            title="Rollback tidak teruji",
        )
    )
    await session.commit()


async def test_reviewer_accepts_and_change_enters_approval(client, session):
    change_id, requester_headers, review_id = await _change_with_review(client, session)
    reviewer = await _make_user(session, "reviewer-accept", "TECH_REVIEWER")

    resp = await _decide(client, change_id, review_id, _h(reviewer), {"decision": "ACCEPT", "comment": "Tinjauan manual: tidak ada penghalang."})
    assert resp.status_code == 200, resp.text
    assert resp.json()["change_status"] == ChangeStatus.PENDING_APPROVAL.value

    review = (await client.get(f"/api/v1/changes/{change_id}/reviews/{review_id}", headers=_h(reviewer))).json()
    assert review["result"]["decision"] == "ACCEPT"
    assert review["result"]["decided_by"] == reviewer.username

    events = (
        await session.execute(select(AuditEvent).where(AuditEvent.action == "review.decision"))
    ).scalars().all()
    assert any(str(e.object_id) == change_id and e.event_data["decision"] == "ACCEPT" for e in events)


async def test_reviewer_returns_for_revision(client, session):
    change_id, _, review_id = await _change_with_review(client, session)
    reviewer = await _make_user(session, "reviewer-return", "TECH_REVIEWER")

    resp = await _decide(
        client, change_id, review_id, _h(reviewer), {"decision": "RETURN_FOR_REVISION", "comment": "Lengkapi MOP"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["change_status"] == ChangeStatus.REVISION_REQUIRED.value

    review = (await client.get(f"/api/v1/changes/{change_id}/reviews/{review_id}", headers=_h(reviewer))).json()
    assert review["result"]["decision_comment"] == "Lengkapi MOP"


async def test_reason_required_for_any_decision(client, session):
    change_id, _, review_id = await _change_with_review(client, session)
    reviewer = await _make_user(session, "reviewer-nocomment", "TECH_REVIEWER")

    resp = await _decide(client, change_id, review_id, _h(reviewer), {"decision": "RETURN_FOR_REVISION"})
    assert resp.status_code == 400
    resp = await _decide(client, change_id, review_id, _h(reviewer), {"decision": "ACCEPT"})
    assert resp.status_code == 400


async def test_accept_overrides_open_blocker_with_reason(client, session):
    """A reviewer may approve a blocked RFC manually, for any risk level."""
    change_id, _, review_id = await _change_with_review(client, session)
    await _add_blocker(session, review_id)
    reviewer = await _make_user(session, "reviewer-blocker", "TECH_REVIEWER")

    resp = await _decide(
        client,
        change_id,
        review_id,
        _h(reviewer),
        {"decision": "ACCEPT", "comment": "Rollback sudah diuji di lab; risiko diterima."},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["change_status"] == ChangeStatus.PENDING_APPROVAL.value

    amplified = (
        await session.execute(select(AuditEvent).where(AuditEvent.action == "review.decision"))
    ).scalars().all()
    event = next(e for e in amplified if str(e.object_id) == change_id)
    assert event.event_data["overridden_findings"][0]["title"] == "Rollback tidak teruji"


async def test_reviewer_may_decide_after_findings_returned_it(client, session):
    """Findings leave the RFC at REVISION_REQUIRED; the reviewer still decides it."""
    change_id, _, review_id = await _change_with_review(client, session, status=ChangeStatus.REVISION_REQUIRED)
    reviewer = await _make_user(session, "reviewer-after-findings", "TECH_REVIEWER")

    resp = await _decide(
        client, change_id, review_id, _h(reviewer), {"decision": "ACCEPT", "comment": "Ditinjau manual, aman."}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["change_status"] == ChangeStatus.PENDING_APPROVAL.value


async def test_only_reviewer_role_may_decide(client, session):
    change_id, requester_headers, review_id = await _change_with_review(client, session)
    manager = await _make_user(session, "manager-decides", "MANAGER")

    resp = await _decide(client, change_id, review_id, requester_headers, {"decision": "ACCEPT"})
    assert resp.status_code == 403
    resp = await _decide(client, change_id, review_id, _h(manager), {"decision": "ACCEPT"})
    assert resp.status_code == 403


async def test_decision_refused_outside_ai_review(client, session):
    change_id, _, review_id = await _change_with_review(client, session, status=ChangeStatus.DRAFT)
    reviewer = await _make_user(session, "reviewer-wrong-state", "TECH_REVIEWER")

    resp = await _decide(client, change_id, review_id, _h(reviewer), {"decision": "ACCEPT"})
    assert resp.status_code == 400