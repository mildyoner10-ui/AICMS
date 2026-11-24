from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ReviewJob, ReviewResult, Finding, ReviewStatus,
    FindingStatus, FindingSeverity, ReviewRecommendation,
    AuditEvent, AuditActorType,
)


async def create_review_job(session: AsyncSession, change_id: str, revision_id: str, user_id: str) -> ReviewJob:
    """Create a review job and enqueue it."""
    job = ReviewJob(
        change_id=change_id,
        revision_id=revision_id,
        status=ReviewStatus.QUEUED,
        created_by_id=user_id,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


async def get_review_job(session: AsyncSession, review_id: str) -> ReviewJob | None:
    result = await session.execute(
        select(ReviewJob)
        .options(
            selectinload(ReviewJob.result).selectinload(ReviewResult.decided_by),
            selectinload(ReviewJob.result).selectinload(ReviewResult.findings),
        )
        .where(ReviewJob.id == review_id)
    )
    return result.scalar_one_or_none()


async def get_reviews_for_change(session: AsyncSession, change_id: str) -> list[ReviewJob]:
    result = await session.execute(
        select(ReviewJob)
        .where(ReviewJob.change_id == change_id)
        .order_by(ReviewJob.started_at.desc().nullslast(), ReviewJob.id.desc())
    )
    return list(result.scalars().all())


async def complete_review_job(
    session: AsyncSession,
    job: ReviewJob,
    provider: str,
    model_name: str,
    result_data: dict,
):
    """Mark a review job as completed and persist result."""
    job.status = ReviewStatus.COMPLETED
    job.provider = provider
    job.model_name = model_name
    if job.started_at is None:
        job.started_at = datetime.now(timezone.utc)
    job.completed_at = datetime.now(timezone.utc)
    job.prompt_version = result_data.get("prompt_version", "v1")
    job.ruleset_version = result_data.get("ruleset_version", "v1")

    result = ReviewResult(
        review_job_id=job.id,
        recommendation=result_data.get("recommendation"),
        overall_risk_score=result_data.get("overall_risk_score"),
        summary=result_data.get("summary"),
        limitations=result_data.get("limitations", []),
        formula_version=result_data.get("formula_version", "v1"),
        result_json=result_data,
    )
    session.add(result)
    await session.flush()  # populate result.id for finding FK

    # Add findings
    for finding_data in result_data.get("findings", []):
        finding = Finding(
            review_result_id=result.id,
            check_category=finding_data.get("category", "UNKNOWN"),
            check_name=finding_data.get("check_name"),
            status=finding_data.get("status", "NOT_ASSESSED"),
            severity=finding_data.get("severity", "LOW"),
            title=finding_data.get("title", ""),
            description=finding_data.get("description"),
            evidence=finding_data.get("evidence", []),
            remediation=finding_data.get("remediation"),
            confidence=finding_data.get("confidence"),
            human_validation_required=finding_data.get("human_validation_required", False),
        )
        session.add(finding)

    # Audit
    audit = AuditEvent(
        actor_type=AuditActorType.AI.value,
        action="review.completed",
        object_type="REVIEW_JOB",
        object_id=job.id,
        event_data={
            "provider": provider,
            "recommendation": result_data.get("recommendation"),
            "risk_score": result_data.get("overall_risk_score"),
        },
    )
    session.add(audit)

    await session.commit()


async def fail_review_job(session: AsyncSession, job: ReviewJob, error_code: str, error_message: str):
    """Mark a review job as failed."""
    job.status = ReviewStatus.FAILED
    job.error_code = error_code
    job.error_message = error_message
    job.completed_at = datetime.now(timezone.utc)
    await session.commit()
