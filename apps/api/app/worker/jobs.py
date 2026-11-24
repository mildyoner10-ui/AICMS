"""Background jobs executed by the RQ worker.

The API enqueues by dotted path (`app.worker.jobs.run_review_job`) so the job
never has to import the API's request layer.
"""

import asyncio

from app.db.session import async_session_factory
from app.models import ReviewJob, ReviewStatus
from app.services import workflow_service
from app.services.review_runner import run_review


def run_review_job(review_job_id: str) -> str:
    """RQ entrypoint: run one AI review, advance the change, return the final status."""
    return asyncio.run(_run(review_job_id))


async def _run(review_job_id: str) -> str:
    async with async_session_factory() as session:
        job = await session.get(ReviewJob, review_job_id)
        if job is None:
            return "NOT_FOUND"
        try:
            await run_review(session, job)
        finally:
            await session.refresh(job)
            # Move the change on (PENDING_APPROVAL / REVISION_REQUIRED / REVIEW_FAILED) so a
            # finished review never leaves it parked in AI_REVIEW.
            if job.status in (ReviewStatus.COMPLETED, ReviewStatus.FAILED):
                try:
                    await workflow_service.evaluate_review_outcome(
                        session, str(job.change_id), job.id, None
                    )
                except workflow_service.TransitionError:
                    pass  # change was moved on elsewhere; the review result still stands
            await session.refresh(job)
            return job.status.value
