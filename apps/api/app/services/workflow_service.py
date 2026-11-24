"""Change lifecycle state machine: submit, advance, stale/invalidation.

Transitions mirror markdown/06_WORKFLOW_AND_APPROVAL.md §2. The AI never drives a
decision here: it only feeds findings that the state machine interprets by rule.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ApprovalDecision,
    ApprovalTask,
    ApprovalTaskStatus,
    AuditActorType,
    AuditEvent,
    Change,
    ChangeRevision,
    ChangeStatus,
    Finding,
    FindingSeverity,
    FindingStatus,
    ImplementationOutcome,
    ImplementationRecord,
    ReviewDecision,
    ReviewJob,
    ReviewResult,
    ReviewStatus,
    Role,
    RiskAssessment,
    WorkflowInstance,
    WorkflowInstanceStatus,
)
from app.services import approval_matrix
from app.services import change_service


class TransitionError(ValueError):
    """Raised when a state change is not permitted."""


# Allowed forward transitions. Exception states are reachable per their guards.
ALLOWED_TRANSITIONS: dict[ChangeStatus, set[ChangeStatus]] = {
    ChangeStatus.DRAFT: {ChangeStatus.SUBMITTED, ChangeStatus.CANCELLED},
    ChangeStatus.SUBMITTED: {ChangeStatus.DOCUMENT_VALIDATION, ChangeStatus.CANCELLED},
    ChangeStatus.DOCUMENT_VALIDATION: {ChangeStatus.AI_REVIEW, ChangeStatus.CANCELLED},
    ChangeStatus.AI_REVIEW: {
        ChangeStatus.PENDING_APPROVAL,
        ChangeStatus.REVISION_REQUIRED,
        ChangeStatus.REVIEW_FAILED,
        ChangeStatus.CANCELLED,
    },
    ChangeStatus.PENDING_APPROVAL: {
        ChangeStatus.APPROVED,
        ChangeStatus.REJECTED,
        ChangeStatus.REVISION_REQUIRED,
        ChangeStatus.CANCELLED,
    },
    ChangeStatus.APPROVED: {ChangeStatus.SCHEDULED, ChangeStatus.CANCELLED, ChangeStatus.STALE},
    ChangeStatus.SCHEDULED: {
        ChangeStatus.IN_PROGRESS,
        ChangeStatus.CANCELLED,
        ChangeStatus.STALE,
    },
    ChangeStatus.IN_PROGRESS: {
        ChangeStatus.VALIDATION,
        ChangeStatus.FAILED,
        ChangeStatus.ROLLED_BACK,
        ChangeStatus.STALE,
    },
    ChangeStatus.VALIDATION: {ChangeStatus.COMPLETED, ChangeStatus.ROLLED_BACK, ChangeStatus.FAILED},
    ChangeStatus.COMPLETED: {ChangeStatus.CLOSED},
    # Recovery paths
    ChangeStatus.REVISION_REQUIRED: {ChangeStatus.DRAFT, ChangeStatus.PENDING_APPROVAL, ChangeStatus.CANCELLED},
    ChangeStatus.REVIEW_FAILED: {ChangeStatus.AI_REVIEW, ChangeStatus.CANCELLED},
    ChangeStatus.STALE: {ChangeStatus.DRAFT, ChangeStatus.CANCELLED},
    ChangeStatus.REJECTED: {ChangeStatus.DRAFT, ChangeStatus.CANCELLED},
}


def can_transition(from_status: ChangeStatus, to_status: ChangeStatus) -> bool:
    return to_status in ALLOWED_TRANSITIONS.get(from_status, set())


# Roles allowed to verify an AI review result and set the change on its way.
REVIEWER_ROLES = {"TECH_REVIEWER", "ADMIN"}


def _transition(
    session: AsyncSession,
    change: Change,
    to_status: ChangeStatus,
    *,
    revision: Optional[ChangeRevision] = None,
    actor_user_id: Optional[str] = None,
    reason: Optional[str] = None,
) -> None:
    from_status = change.status
    if not can_transition(from_status, to_status):
        raise TransitionError(f"Illegal transition {from_status.value} -> {to_status.value}")
    change.status = to_status
    change_service.record_transition(
        session,
        change,
        to_status,
        from_status=from_status,
        revision=revision,
        actor_user_id=actor_user_id,
        reason=reason,
    )
    session.add(
        AuditEvent(
            actor_user_id=actor_user_id,
            actor_type="USER",
            action=f"change.transition.{to_status.value.lower()}",
            object_type="CHANGE",
            object_id=change.id,
            event_data={"from": from_status.value, "to": to_status.value, "reason": reason},
        )
    )


def required_fields_missing(change: Change) -> list[str]:
    """Guards for DRAFT -> SUBMITTED (markdown §2)."""
    missing = []
    if not (change.title and change.title.strip()):
        missing.append("title")
    if not change.category:
        missing.append("category")
    if not (change.business_justification and change.business_justification.strip()):
        missing.append("business_justification")
    if not (change.implementation_plan and change.implementation_plan.strip()):
        missing.append("implementation_plan")
    if not (change.rollback_plan and change.rollback_plan.strip()):
        missing.append("rollback_plan")
    if change.change_type and change.change_type.value == "EMERGENCY":
        if not (change.emergency_justification and change.emergency_justification.strip()):
            missing.append("emergency_justification")
    return missing


# ── Stale / invalidation ─────────────────────────────────────────────────────


async def invalidate_approvals(
    session: AsyncSession,
    change: Change,
    *,
    actor_user_id: Optional[str] = None,
    reason: str,
) -> int:
    """Cancel pending approval tasks (markdown §5). Returns count cancelled."""
    instances = (
        await session.execute(select(WorkflowInstance).where(WorkflowInstance.change_id == change.id))
    ).scalars().all()
    if not instances:
        return 0

    instance_ids = [i.id for i in instances]
    pending = (
        await session.execute(
            select(ApprovalTask).where(
                ApprovalTask.workflow_instance_id.in_(instance_ids),
                ApprovalTask.status == ApprovalTaskStatus.PENDING,
            )
        )
    ).scalars().all()

    now = datetime.now(timezone.utc)
    for task in pending:
        task.status = ApprovalTaskStatus.CANCELLED
        task.comment = f"Invalidated: {reason}"
        task.decided_at = now

    for inst in instances:
        inst.status = WorkflowInstanceStatus.CANCELLED

    if pending:
        session.add(
            AuditEvent(
                actor_user_id=actor_user_id,
                actor_type="SYSTEM",
                action="approvals.invalidated",
                object_type="CHANGE",
                object_id=change.id,
                event_data={"reason": reason, "cancelled_tasks": len(pending)},
            )
        )
    return len(pending)


async def mark_reviews_stale(
    session: AsyncSession,
    change: Change,
    *,
    keep_revision_id=None,
    reason: str = "new revision created",
) -> int:
    """Mark completed/running reviews stale unless they target the kept revision."""
    query = select(ReviewJob).where(
        ReviewJob.change_id == change.id,
        ReviewJob.status.in_([ReviewStatus.QUEUED, ReviewStatus.RUNNING, ReviewStatus.COMPLETED]),
    )
    if keep_revision_id is not None:
        query = query.where(ReviewJob.revision_id != keep_revision_id)
    jobs = (await session.execute(query)).scalars().all()

    for job in jobs:
        job.status = ReviewStatus.STALE
    if jobs:
        session.add(
            AuditEvent(
                actor_user_id=None,
                actor_type="SYSTEM",
                action="reviews.marked_stale",
                object_type="CHANGE",
                object_id=change.id,
                event_data={"reason": reason, "count": len(jobs)},
            )
        )
    return len(jobs)


# ── Submit ───────────────────────────────────────────────────────────────────


async def submit_change(
    session: AsyncSession, change_id: str, user_id: str, reason: Optional[str] = None
) -> Change:
    """DRAFT -> SUBMITTED. Materialises a locked revision snapshot."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    if change.status != ChangeStatus.DRAFT:
        raise TransitionError(f"Cannot submit change in status: {change.status.value}")

    missing = required_fields_missing(change)
    if missing:
        raise TransitionError(f"Missing required fields: {', '.join(missing)}")

    revision = await change_service.create_new_revision(session, change, user_id, reason="submitted")
    revision.locked_at = datetime.now(timezone.utc)
    revision.is_current = True

    # Any earlier review or approval no longer describes what was submitted.
    await mark_reviews_stale(session, change, keep_revision_id=revision.id)
    await invalidate_approvals(session, change, actor_user_id=user_id, reason="new submission")

    _transition(session, change, ChangeStatus.SUBMITTED, revision=revision, actor_user_id=user_id, reason=reason)
    change.submitted_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(change)
    return change


# ── Advancing the pipeline ───────────────────────────────────────────────────


async def advance_document_validation(session: AsyncSession, change_id: str, user_id: Optional[str] = None) -> Change:
    """SUBMITTED -> DOCUMENT_VALIDATION."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    _transition(session, change, ChangeStatus.DOCUMENT_VALIDATION, actor_user_id=user_id)
    await session.commit()
    await session.refresh(change)
    return change


async def advance_ai_review(session: AsyncSession, change_id: str, user_id: Optional[str] = None) -> Change:
    """DOCUMENT_VALIDATION -> AI_REVIEW."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    _transition(session, change, ChangeStatus.AI_REVIEW, actor_user_id=user_id)
    await session.commit()
    await session.refresh(change)
    return change


# ── Approval workflow ────────────────────────────────────────────────────────


async def _role_id(session: AsyncSession, code: str):
    role = (await session.execute(select(Role).where(Role.code == code))).scalar_one_or_none()
    if not role:
        # Approval routing must never silently lose a step because a role is unseeded.
        role = Role(id=uuid.uuid4(), code=code, name=code.replace("_", " ").title())
        session.add(role)
        await session.flush()
    return role.id


async def ensure_workflow(session: AsyncSession, change: Change, revision: ChangeRevision) -> WorkflowInstance:
    """Create the approval workflow and its pending tasks (does not commit).

    Routing comes from the review's risk assessment. Only the first step is
    actionable; the rest unlock as earlier steps approve.
    """
    existing = (
        await session.execute(
            select(WorkflowInstance).where(
                WorkflowInstance.change_id == change.id,
                WorkflowInstance.status != WorkflowInstanceStatus.CANCELLED,
            )
        )
    ).scalars().first()
    if existing:
        return existing

    risk = (
        await session.execute(
            select(RiskAssessment).where(RiskAssessment.revision_id == revision.id).order_by(RiskAssessment.calculated_at.desc())
        )
    ).scalars().first()
    route = approval_matrix.route_for(
        change.change_type.value if hasattr(change.change_type, "value") else str(change.change_type),
        risk.risk_level if risk else None,
    )

    instance = WorkflowInstance(
        change_id=change.id,
        revision_id=revision.id,
        status=WorkflowInstanceStatus.PENDING,
        current_step=route[0] if route else None,
    )
    session.add(instance)
    await session.flush()

    for order, code in enumerate(route, start=1):
        session.add(
            ApprovalTask(
                workflow_instance_id=instance.id,
                revision_id=revision.id,
                step_code=code,
                step_order=order,
                assigned_role_id=await _role_id(session, code),
                status=ApprovalTaskStatus.PENDING,
            )
        )
    await session.flush()

    session.add(
        AuditEvent(
            actor_type="SYSTEM",
            action="approval.workflow_created",
            object_type="CHANGE",
            object_id=change.id,
            event_data={"route": route, "risk_level": risk.risk_level if risk else None},
        )
    )
    return instance


async def open_tasks(session: AsyncSession, change: Change) -> list[str]:
    """Task IDs at the lowest step still awaiting a decision."""
    instance = (
        await session.execute(
            select(WorkflowInstance).where(
                WorkflowInstance.change_id == change.id,
                WorkflowInstance.status != WorkflowInstanceStatus.CANCELLED,
            )
        )
    ).scalars().first()
    if not instance:
        return []
    tasks = (
        await session.execute(
            select(ApprovalTask)
            .where(ApprovalTask.workflow_instance_id == instance.id, ApprovalTask.status == ApprovalTaskStatus.PENDING)
            .order_by(ApprovalTask.step_order)
        )
    ).scalars().all()
    open_tasks = [t for t in tasks if t.status == ApprovalTaskStatus.PENDING]
    if not open_tasks:
        return []
    lowest = min(t.step_order for t in open_tasks)
    return [str(t.id) for t in open_tasks if t.step_order == lowest]


async def is_task_open(session: AsyncSession, task: ApprovalTask) -> bool:
    """True when no earlier step in the same workflow is still pending."""
    earlier = (
        await session.execute(
            select(ApprovalTask).where(
                ApprovalTask.workflow_instance_id == task.workflow_instance_id,
                ApprovalTask.step_order < task.step_order,
                ApprovalTask.status == ApprovalTaskStatus.PENDING,
            )
        )
    ).scalars().first()
    return earlier is None


async def evaluate_review_outcome(
    session: AsyncSession, change_id: str, review_job_id, user_id: Optional[str] = None
) -> Change:
    """AI_REVIEW -> PENDING_APPROVAL | REVISION_REQUIRED | REVIEW_FAILED.

    Rule (markdown §2): completed review with no unresolved mandatory blocker
    moves to approval; findings needing requester action move to revision;
    failed or stale review moves to review_failed. The recommendation text is
    advisory only — the gate is the presence of CRITICAL/FAIL findings.
    """
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    if change.status != ChangeStatus.AI_REVIEW:
        raise TransitionError(f"Change is not in AI_REVIEW (is {change.status.value})")

    job = (
        await session.execute(
            select(ReviewJob).where(ReviewJob.id == review_job_id).options(selectinload(ReviewJob.result))
        )
    ).scalar_one_or_none()
    if not job:
        raise TransitionError("Review job not found")

    current = await change_service.get_current_revision(session, change.id)
    if current and job.revision_id != current.id:
        _transition(
            session, change, ChangeStatus.REVIEW_FAILED, actor_user_id=user_id, reason="review targets a stale revision"
        )
        await session.commit()
        await session.refresh(change)
        return change

    if job.status != ReviewStatus.COMPLETED or not job.result:
        _transition(
            session,
            change,
            ChangeStatus.REVIEW_FAILED,
            actor_user_id=user_id,
            reason=f"review status {job.status.value}",
        )
        await session.commit()
        await session.refresh(change)
        return change

    blocking = (
        await session.execute(
            select(Finding).where(
                Finding.review_result_id == job.result.id,
                Finding.status == FindingStatus.FAIL,
                Finding.severity.in_([FindingSeverity.HIGH, FindingSeverity.CRITICAL]),
            )
        )
    ).scalars().all()

    if blocking:
        # Nothing is auto-rejected and nothing is auto-approved twice: the RFC
        # is held here until a reviewer verifies it (see decide_review).
        _transition(
            session,
            change,
            ChangeStatus.REVISION_REQUIRED,
            actor_user_id=user_id,
            reason=f"{len(blocking)} blocking finding(s) — awaiting reviewer decision",
        )
    else:
        _transition(session, change, ChangeStatus.PENDING_APPROVAL, actor_user_id=user_id, reason="review clear")
        await ensure_workflow(session, change, current or job.revision)

    await session.commit()
    await session.refresh(change)
    return change


async def decide_review(
    session: AsyncSession,
    change_id: str,
    *,
    decision: str,
    user_id: str,
    review_id: Optional[str] = None,
    comment: Optional[str] = None,
) -> Change:
    """Reviewer verification of an AI result (no AI involvement).

    The reviewer is the authority for every risk level: ACCEPT forwards the RFC
    to approval even when open HIGH/CRITICAL findings remain, provided the
    reviewer states a reason. Findings themselves are never altered, the
    override is recorded on the result and in the audit trail.
    RETURN_FOR_REVISION sends the change back to the requester.
    """
    try:
        value = ReviewDecision(decision)
    except ValueError:
        raise TransitionError(f"Unknown review decision: {decision}") from None
    if not (comment and comment.strip()):
        raise TransitionError("A reason is required for the reviewer decision")

    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    if change.status not in (ChangeStatus.AI_REVIEW, ChangeStatus.REVISION_REQUIRED):
        raise TransitionError(
            f"Review can only be decided while in AI_REVIEW or REVISION_REQUIRED (is {change.status.value})"
        )

    if review_id:
        job = (
            await session.execute(
                select(ReviewJob).where(ReviewJob.id == review_id, ReviewJob.change_id == change.id).options(selectinload(ReviewJob.result))
            )
        ).scalar_one_or_none()
    else:
        job = (
            await session.execute(
                select(ReviewJob)
                .where(ReviewJob.change_id == change.id)
                .options(selectinload(ReviewJob.result))
                .order_by(ReviewJob.started_at.desc().nullslast(), ReviewJob.id.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
    if not job:
        raise TransitionError("No review to decide")
    if job.status != ReviewStatus.COMPLETED or not job.result:
        raise TransitionError("The review has not completed yet")

    current = await change_service.get_current_revision(session, change.id)
    if current and job.revision_id != current.id:
        raise TransitionError("Review targets a superseded revision")

    result = job.result
    result.decision = value
    result.decision_comment = comment
    result.decided_by_id = user_id
    result.decided_at = datetime.now(timezone.utc)
    blocking = []

    if value == ReviewDecision.ACCEPT:
        blocking = (
            await session.execute(
                select(Finding).where(
                    Finding.review_result_id == result.id,
                    Finding.status == FindingStatus.FAIL,
                    Finding.severity.in_([FindingSeverity.HIGH, FindingSeverity.CRITICAL]),
                )
            )
        ).scalars().all()
        reason = "reviewer accepted after manual review" + (
            f" ({len(blocking)} high/critical finding(s) overridden)" if blocking else ""
        )
        _transition(session, change, ChangeStatus.PENDING_APPROVAL, actor_user_id=user_id, reason=reason)
        await ensure_workflow(session, change, current or job.revision)
    else:
        _transition(session, change, ChangeStatus.REVISION_REQUIRED, actor_user_id=user_id, reason=comment)
        await invalidate_approvals(session, change, actor_user_id=user_id, reason="review returned for revision")

    session.add(
        AuditEvent(
            actor_user_id=user_id,
            actor_type=AuditActorType.USER.value,
            action="review.decision",
            object_type="CHANGE",
            object_id=change.id,
            event_data={
                "review_id": str(job.id),
                "revision_id": str(job.revision_id),
                "decision": value.value,
                "comment": comment,
                "overridden_findings": [
                    {"id": str(f.id), "title": f.title, "severity": f.severity.value} for f in (blocking or [])
                ],
            },
        )
    )

    await session.commit()
    await session.refresh(change)
    return change


async def approve_change(session: AsyncSession, change_id: str, user_id: Optional[str] = None) -> Change:
    """PENDING_APPROVAL -> APPROVED once every mandatory task is approved.

    Records the approved revision so later changes can invalidate it.
    """
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")

    instances = (
        await session.execute(select(WorkflowInstance).where(WorkflowInstance.change_id == change.id))
    ).scalars().all()
    if not instances:
        raise TransitionError("No approval workflow for this change")

    tasks = (
        await session.execute(
            select(ApprovalTask).where(ApprovalTask.workflow_instance_id.in_([i.id for i in instances]))
        )
    ).scalars().all()
    if not tasks or any(t.status != ApprovalTaskStatus.APPROVED for t in tasks):
        raise TransitionError("Not all approval tasks are approved")

    current = await change_service.get_current_revision(session, change.id)
    task_revisions = {t.revision_id for t in tasks if t.revision_id is not None}
    if current and task_revisions and task_revisions != {current.id}:
        raise TransitionError("Approvals were given for a different revision")

    _transition(session, change, ChangeStatus.APPROVED, revision=current, actor_user_id=user_id)
    change.approved_at = datetime.now(timezone.utc)
    change.approved_revision_id = current.id if current else None

    for inst in instances:
        inst.status = WorkflowInstanceStatus.COMPLETED
        inst.completed_at = datetime.now(timezone.utc)

    await session.commit()
    await session.refresh(change)
    return change


async def unlock_next_step(session: AsyncSession, task: ApprovalTask) -> Optional[str]:
    """After an approval, point the workflow at the next pending step (does not commit)."""
    instance = (
        await session.execute(select(WorkflowInstance).where(WorkflowInstance.id == task.workflow_instance_id))
    ).scalar_one_or_none()
    if not instance:
        return None
    following = (
        await session.execute(
            select(ApprovalTask)
            .where(
                ApprovalTask.workflow_instance_id == instance.id,
                ApprovalTask.status == ApprovalTaskStatus.PENDING,
            )
            .order_by(ApprovalTask.step_order)
            .limit(1)
        )
    ).scalars().first()
    instance.current_step = following.step_code if following else None
    if following and instance.status == WorkflowInstanceStatus.PENDING:
        instance.status = WorkflowInstanceStatus.IN_PROGRESS
    return instance.current_step


async def reject_change(
    session: AsyncSession, change_id: str, user_id: str, reason: str
) -> Change:
    """PENDING_APPROVAL -> REJECTED. Requires a reason (markdown §4)."""
    if not reason or not reason.strip():
        raise TransitionError("Rejection requires a reason")
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    _transition(session, change, ChangeStatus.REJECTED, actor_user_id=user_id, reason=reason)
    await session.commit()
    await session.refresh(change)
    return change


async def require_revision(session: AsyncSession, change_id: str, user_id: str, reason: str) -> Change:
    """PENDING_APPROVAL -> REVISION_REQUIRED, cancelling outstanding approvals."""
    if not reason or not reason.strip():
        raise TransitionError("Requesting revision requires a reason")
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    _transition(session, change, ChangeStatus.REVISION_REQUIRED, actor_user_id=user_id, reason=reason)
    await invalidate_approvals(session, change, actor_user_id=user_id, reason=reason)
    await session.commit()
    await session.refresh(change)
    return change


async def reopen_for_revision(session: AsyncSession, change_id: str, user_id: str) -> Change:
    """REVISION_REQUIRED -> DRAFT so the requester can edit again."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    _transition(session, change, ChangeStatus.DRAFT, actor_user_id=user_id, reason="reopened for revision")
    await session.commit()
    await session.refresh(change)
    return change


async def cancel_change(session: AsyncSession, change_id: str, user_id: str, reason: str) -> Change:
    """Cancel from any cancellable state."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    if change.status == ChangeStatus.CANCELLED:
        return change
    _transition(session, change, ChangeStatus.CANCELLED, actor_user_id=user_id, reason=reason)
    await invalidate_approvals(session, change, actor_user_id=user_id, reason="change cancelled")
    await session.commit()
    await session.refresh(change)
    return change


# ── Execution gate (markdown §8) ─────────────────────────────────────────────


async def execution_gate_errors(session: AsyncSession, change: Change) -> list[str]:
    """Reasons a change is not execution-ready. Empty list means ready."""
    errors = []
    if change.status not in (ChangeStatus.APPROVED, ChangeStatus.SCHEDULED):
        errors.append(f"status {change.status.value} is not executable")
    current = await change_service.get_current_revision(session, change.id)
    if change.approved_revision_id is None:
        errors.append("no approved revision on record")
    elif current and current.id != change.approved_revision_id:
        errors.append("current revision differs from the approved revision")
    return errors


# ── Implementation & PIR (Stage 5) ───────────────────────────────────────────


async def schedule_change(
    session: AsyncSession,
    change_id: str,
    user_id: str,
    start: datetime,
    end: datetime,
    reason: Optional[str] = None,
) -> Change:
    """APPROVED -> SCHEDULED. The window is validated, never assumed."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    if end <= start:
        raise TransitionError("Schedule end must be after start")

    # An approval only covers the revision it was given for.
    gate = await execution_gate_errors(session, change)
    if gate and any("revision" in e for e in gate):
        raise TransitionError("Cannot schedule: " + "; ".join(gate))

    change.implementation_start = start
    change.implementation_end = end
    _transition(session, change, ChangeStatus.SCHEDULED, actor_user_id=user_id, reason=reason)
    await session.commit()
    await session.refresh(change)
    return change


async def start_implementation(
    session: AsyncSession, change_id: str, user_id: str, notes: Optional[str] = None
) -> ImplementationRecord:
    """SCHEDULED -> IN_PROGRESS, opening the implementation record."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    gate = await execution_gate_errors(session, change)
    if gate:
        raise TransitionError("Change is not execution-ready: " + "; ".join(gate))

    record = (
        await session.execute(select(ImplementationRecord).where(ImplementationRecord.change_id == change.id))
    ).scalar_one_or_none()
    if record is None:
        record = ImplementationRecord(change_id=change.id)
        session.add(record)
    record.actual_start = datetime.now(timezone.utc)
    record.implementer_id = user_id
    if notes:
        record.execution_notes = notes

    _transition(session, change, ChangeStatus.IN_PROGRESS, actor_user_id=user_id)
    await session.commit()
    await session.refresh(record)
    return record


# Outcome -> terminal status. Each outcome demands its own evidence.
_OUTCOME_STATUS: dict[ImplementationOutcome, ChangeStatus] = {
    ImplementationOutcome.SUCCESSFUL: ChangeStatus.VALIDATION,
    ImplementationOutcome.SUCCESSFUL_WITH_DEVIATION: ChangeStatus.VALIDATION,
    ImplementationOutcome.FAILED: ChangeStatus.FAILED,
    ImplementationOutcome.ROLLED_BACK: ChangeStatus.ROLLED_BACK,
}


async def record_outcome(
    session: AsyncSession,
    change_id: str,
    user_id: str,
    outcome: str,
    notes: Optional[str] = None,
    post_check_passed: Optional[bool] = None,
    evidence: Optional[list] = None,
) -> ImplementationRecord:
    """IN_PROGRESS -> VALIDATION / FAILED / ROLLED_BACK from the reported outcome."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    try:
        value = ImplementationOutcome(outcome)
    except ValueError:
        raise TransitionError(f"Unknown outcome: {outcome}") from None
    if change.status != ChangeStatus.IN_PROGRESS:
        raise TransitionError(f"Cannot record outcome for change in status: {change.status.value}")

    record = (
        await session.execute(select(ImplementationRecord).where(ImplementationRecord.change_id == change.id))
    ).scalar_one_or_none()
    if record is None:
        raise TransitionError("No implementation record: start the implementation first")

    record.actual_end = datetime.now(timezone.utc)
    record.outcome = value
    record.rollback_performed = value == ImplementationOutcome.ROLLED_BACK
    if notes:
        record.execution_notes = notes
    postcheck = dict(record.postcheck or {})
    if post_check_passed is not None:
        postcheck["passed"] = post_check_passed
    if evidence:
        postcheck["evidence"] = evidence
    record.postcheck = postcheck

    _transition(
        session,
        change,
        _OUTCOME_STATUS[value],
        actor_user_id=user_id,
        reason=f"outcome: {value.value}",
    )
    await session.commit()
    await session.refresh(record)
    return record


async def submit_pir(session: AsyncSession, change_id: str, user_id: str, data: dict) -> Change:
    """VALIDATION -> COMPLETED once the PIR is recorded and post-checks pass."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    if change.status != ChangeStatus.VALIDATION:
        raise TransitionError(f"PIR requires status VALIDATION, got: {change.status.value}")
    notes = (data.get("notes") or "").strip()
    if not notes:
        raise TransitionError("PIR notes are required")
    if data.get("post_check_passed") is False:
        # A failed post-check is not a completed change: roll back instead.
        raise TransitionError("Post-check failed: mark the implementation rolled back or failed")

    record = (
        await session.execute(select(ImplementationRecord).where(ImplementationRecord.change_id == change.id))
    ).scalar_one_or_none()
    if record is None:
        raise TransitionError("No implementation record to review")

    record.postcheck = {
        **(record.postcheck or {}),
        "pir_notes": notes,
        "pir_author_id": user_id,
        "service_validation": data.get("service_validation"),
        "pir_recorded_at": datetime.now(timezone.utc).isoformat(),
    }
    _transition(session, change, ChangeStatus.COMPLETED, actor_user_id=user_id, reason="PIR accepted")
    session.add(
        AuditEvent(
            actor_user_id=user_id,
            actor_type=AuditActorType.USER.value,
            action="pir.created",
            object_type="CHANGE",
            object_id=change.id,
            event_data={"outcome": record.outcome.value if record.outcome else None},
        )
    )
    await session.commit()
    await session.refresh(change)
    return change


async def close_change(session: AsyncSession, change_id: str, user_id: str, reason: Optional[str] = None) -> Change:
    """COMPLETED -> CLOSED."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise TransitionError("Change not found")
    _transition(session, change, ChangeStatus.CLOSED, actor_user_id=user_id, reason=reason)
    await session.commit()
    await session.refresh(change)
    return change
