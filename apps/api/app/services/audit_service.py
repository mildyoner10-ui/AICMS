from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AuditEvent,
    AuditActorType,
    Change,
    Notification,
    User,
    WorkflowInstance,
    WorkflowInstanceStatus,
)
from app.schemas.dashboard import DashboardSummary, RiskDistribution, ApprovalAgingResponse


async def create_audit_event(
    session: AsyncSession,
    action: str,
    object_type: str,
    object_id: str,
    user_id: Optional[str] = None,
    event_data: Optional[dict] = None,
    correlation_id: Optional[str] = None,
    actor_type: AuditActorType = AuditActorType.USER,
) -> AuditEvent:
    """Create an audit event. Append-only."""
    event = AuditEvent(
        actor_user_id=user_id,
        actor_type=actor_type,
        action=action,
        object_type=object_type,
        object_id=object_id,
        correlation_id=correlation_id,
        event_data=event_data or {},
    )
    session.add(event)
    await session.flush()  # caller owns the transaction boundary
    return event


async def get_audit_events(
    session: AsyncSession,
    object_type: Optional[str] = None,
    object_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[AuditEvent], int]:
    filters = []
    if object_type:
        filters.append(AuditEvent.object_type == object_type)
    if object_id:
        filters.append(AuditEvent.object_id == object_id)

    total = await session.scalar(select(func.count()).select_from(AuditEvent).where(*filters)) or 0
    query = (
        select(AuditEvent)
        .where(*filters)
        .order_by(AuditEvent.occurred_at.desc())
        .limit(limit)
        .offset(offset)
    )

    result = await session.execute(query)
    return list(result.scalars().all()), total


async def object_labels(session: AsyncSession, events: list[AuditEvent]) -> dict[str, dict[str, str]]:
    """Resolve object ids to the business labels users recognise (change number, username).

    Audit rows store ids; showing a bare UUID tells a human nothing. keyed by object_type.
    """
    labels: dict[str, dict[str, str]] = {}
    change_ids = {str(e.object_id) for e in events if e.object_type in ("CHANGE", "change")}
    if change_ids:
        rows = await session.execute(
            select(Change.id, Change.change_number).where(Change.id.in_(change_ids))
        )
        labels["CHANGE"] = labels["change"] = {str(i): n for i, n in rows}

    user_ids = {str(e.object_id) for e in events if e.object_type in ("USER", "user")}
    ids = {str(e.actor_user_id) for e in events if e.actor_user_id} | user_ids
    if ids:
        rows = await session.execute(select(User.id, User.username).where(User.id.in_(ids)))
        names = {str(i): u for i, u in rows}
        labels["USER"] = labels["user"] = {i: names[i] for i in user_ids & names.keys()}
        labels["actor"] = names
    return labels


async def create_notification(
    session: AsyncSession,
    recipient_user_id: str,
    channel: str,
    payload: dict,
) -> Notification:
    """Create a notification (console/email)."""
    notification = Notification(
        recipient_user_id=recipient_user_id,
        channel=channel,
        payload=payload,
        status="PENDING",
    )
    session.add(notification)
    await session.commit()
    return notification


async def get_dashboard_summary(session: AsyncSession) -> dict:
    """Get dashboard summary data."""
    from app.models import Change, ReviewJob, ApprovalTask, WorkflowInstance, AuditEvent
    from sqlalchemy import func, cast, extract

    # Only non-deleted changes.
    result = await session.execute(select(Change).where(Change.deleted_at.is_(None)))
    changes = result.scalars().all()

    by_status = {}
    by_category = {}
    by_type = {}
    completed = 0
    failed = 0
    rolled_back = 0

    for c in changes:
        status = c.status.value if hasattr(c.status, "value") else str(c.status)
        by_status[status] = by_status.get(status, 0) + 1

        cat = c.category.value if hasattr(c.category, "value") else str(c.category)
        by_category[cat] = by_category.get(cat, 0) + 1

        ctype = c.change_type.value if hasattr(c.change_type, "value") else str(c.change_type)
        by_type[ctype] = by_type.get(ctype, 0) + 1

        if status == "COMPLETED":
            completed += 1
        elif status == "FAILED":
            failed += 1
        elif status == "ROLLED_BACK":
            rolled_back += 1

    # AI review pending
    review_result = await session.execute(
        select(ReviewJob).where(ReviewJob.status.in_(["QUEUED", "RUNNING"]))
    )
    ai_review_pending = len(review_result.scalars().all())

    # AI review flagged (with FAIL or CRITICAL findings)
    flagged = 0
    # Count changes with high severity findings (simplified)
    # In production, query findings table directly

    # Upcoming changes
    now = datetime.now(timezone.utc)
    upcoming_result = await session.execute(
        select(Change).where(
            Change.implementation_start > now,
            Change.status.in_(["APPROVED", "SCHEDULED"]),
            Change.deleted_at.is_(None),
        )
    )
    upcoming = len(upcoming_result.scalars().all())

    # Pending approvals
    approval_result = await session.execute(
        select(ApprovalTask).where(ApprovalTask.status == "PENDING")
    )
    pending_approvals = len(approval_result.scalars().all())

    # Weekly request counts (last 4 weeks from now, WIB)
    weekly_result = await session.execute(
        text(
            "select date_trunc('week', created_at at time zone 'Asia/Jakarta') as wk, "
            "count(*) as cnt from changes "
            "where deleted_at is null and created_at >= (now() at time zone 'Asia/Jakarta')::date - interval '28 days' "
            "group by wk order by wk"
        )
    )
    weekly = [
        {"label": row[0].strftime("%d-%m"), "value": int(row[1])}
        for row in weekly_result.fetchall()
    ]
    # Approval duration: time from SUBMITTED to first APPROVED
    duration_result = await session.execute(
        text(
            "select t.occurred_at - (select min(t2.occurred_at) from change_status_transitions t2 "
            "where t2.change_id = t.change_id and t2.to_status = 'SUBMITTED') as delta "
            "from change_status_transitions t "
            "where t.to_status = 'APPROVED' and t.occurred_at is not null"
        )
    )
    durations = [
        row[0].total_seconds() / 3600
        for row in duration_result.fetchall()
        if row[0] is not None
    ]
    avg_approval_hours = round(sum(durations) / len(durations), 1) if durations else None
    total_completed = by_status.get("COMPLETED", 0) + by_status.get("CLOSED", 0)
    approved_count = by_status.get("APPROVED", 0) + by_status.get("COMPLETED", 0)
    acceptance_rate = round(approved_count / total_completed * 100, 1) if total_completed else 0.0

    return {
        "total_changes": len(changes),
        "by_status": by_status,
        "by_category": by_category,
        "by_type": by_type,
        "pending_approvals": pending_approvals,
        "ai_review_pending": ai_review_pending,
        "ai_review_flagged": flagged,
        "upcoming_changes": upcoming,
        "completed": completed,
        "failed": failed,
        "rolled_back": rolled_back,
        "weekly_counts": weekly,
        "kpi": {
            "total_active": by_status.get("DRAFT", 0)
                             + by_status.get("SUBMITTED", 0)
                             + by_status.get("DOCUMENT_VALIDATION", 0)
                             + by_status.get("AI_REVIEW", 0)
                             + by_status.get("PENDING_APPROVAL", 0)
                             + by_status.get("REVISION_REQUIRED", 0)
                             + by_status.get("APPROVED", 0)
                             + by_status.get("SCHEDULED", 0)
                             + by_status.get("IN_PROGRESS", 0)
                             + by_status.get("VALIDATION", 0),
            "approval_avg_hours": avg_approval_hours,
            "acceptance_rate": acceptance_rate,
        },
    }


async def get_risk_distribution(session: AsyncSession) -> dict:
    """Get risk score distribution."""
    from app.models import RiskAssessment

    result = await session.execute(select(RiskAssessment))
    assessments = result.scalars().all()

    dist = {"low": 0, "medium": 0, "high": 0, "critical": 0}
    for a in assessments:
        level = a.risk_level.lower()
        if level in dist:
            dist[level] += 1
        else:
            dist["medium"] += 1  # default

    return dist


async def get_approval_aging(session: AsyncSession) -> dict:
    """Get approval task aging."""
    from app.models import ApprovalTask

    now = datetime.now(timezone.utc)
    result = await session.execute(select(ApprovalTask).where(ApprovalTask.status == "PENDING"))
    tasks = result.scalars().all()

    under_24h = 0
    under_48h = 0
    over_48h = 0

    for t in tasks:
        if t.due_at:
            hours = (t.due_at - now).total_seconds() / 3600
            if hours < 0:
                over_48h += 1
            elif hours < 24:
                under_24h += 1
            elif hours < 48:
                under_48h += 1
            else:
                over_48h += 1
        else:
            # No due date - count as overdue
            over_48h += 1

    return {
        "under_24h": under_24h,
        "under_48h": under_48h,
        "over_48h": over_48h,
    }


async def create_workflow_instance(
    session: AsyncSession,
    change_id: str,
    revision_id: Optional[str] = None,
) -> WorkflowInstance:
    """Create a workflow instance for a change."""
    instance = WorkflowInstance(
        change_id=change_id,
        revision_id=revision_id,
        status=WorkflowInstanceStatus.PENDING,
    )
    session.add(instance)
    await session.commit()
    await session.refresh(instance)
    return instance


async def create_approval_tasks(
    session: AsyncSession,
    workflow_instance_id: str,
    steps: list[dict],
) -> list:
    """Create approval tasks from workflow steps.

    Args:
        steps: list of dicts with step_code, step_order, assigned_role_id, due_at_hours
    """
    tasks = []
    for step in steps:
        task = ApprovalTask(
            workflow_instance_id=workflow_instance_id,
            step_code=step["step_code"],
            step_order=step.get("step_order", 0),
            assigned_role_id=step.get("assigned_role_id"),
            assigned_user_id=step.get("assigned_user_id"),
            due_at=step.get("due_at"),
        )
        session.add(task)
        tasks.append(task)

    await session.commit()
    return tasks
