"""Manual review re-run: POST /reviews parks the change in AI_REVIEW before the
job runs, so the worker can evaluate the outcome, and it respects the state machine.
"""

from app.models import ChangeStatus
from test_lifecycle import REQUIRED_RFC, _h, _make_user


async def _new_change(client, session, username):
    user = await _make_user(session, username, "REQUESTER")
    headers = _h(user)
    create = await client.post("/api/v1/changes", json=REQUIRED_RFC, headers=headers)
    assert create.status_code == 201, create.text
    return create.json()["id"], headers


async def test_manual_review_rejected_on_draft(client, session):
    change_id, headers = await _new_change(client, session, "requester-manual-draft")
    review = await client.post(f"/api/v1/changes/{change_id}/reviews", json={}, headers=headers)
    assert review.status_code == 400


async def test_manual_review_allowed_after_failed_review(client, session):
    change_id, headers = await _new_change(client, session, "requester-manual-retry")
    submit = await client.post(f"/api/v1/changes/{change_id}/submit", json={}, headers=headers)
    assert submit.status_code == 200, submit.text

    # Simulate a failed review, the state a retry starts from.
    from sqlalchemy import select

    from app.models import Change, ReviewJob

    change = (await session.execute(select(Change).where(Change.id == change_id))).scalar_one()
    change.status = ChangeStatus.REVIEW_FAILED
    job = (await session.execute(select(ReviewJob).where(ReviewJob.change_id == change_id))).scalars().first()
    job.status = job.status.FAILED
    await session.commit()

    review = await client.post(f"/api/v1/changes/{change_id}/reviews", json={}, headers=headers)
    assert review.status_code == 201, review.text
    # The retry must not leave the change parked in AI_REVIEW.
    final = (await client.get(f"/api/v1/changes/{change_id}", headers=headers)).json()["status"]
    assert final != ChangeStatus.AI_REVIEW.value
