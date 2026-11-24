"""Change request persistence: RFC CRUD, immutable revisions, status timeline."""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    AuditActorType,
    AuditEvent,
    Change,
    ChangeCategory,
    ChangeRevision,
    ChangeStatus,
    ChangeStatusTransition,
    ChangeType,
    Environment,
    User,
)

# Fields captured into a revision snapshot. Keep in sync with ChangeUpdate.
SNAPSHOT_FIELDS = (
    "title",
    "description",
    "category",
    "change_type",
    "business_justification",
    "affected_services",
    "affected_devices",
    "environment",
    "implementation_start",
    "implementation_end",
    "impact_description",
    "implementation_plan",
    "test_plan",
    "rollback_plan",
    "communication_plan",
    "emergency_justification",
    "emergency_incident_ref",
)

# Fields a requester may change on a draft.
UPDATABLE_FIELDS = SNAPSHOT_FIELDS


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def _jsonable(value):
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def snapshot_of(change: Change) -> dict:
    """Deterministic snapshot of the revision-relevant fields of a change."""
    return {f: _jsonable(_enum_value(getattr(change, f))) for f in SNAPSHOT_FIELDS}


def snapshot_hash(snapshot: dict) -> str:
    payload = json.dumps(snapshot, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def record_transition(
    session: AsyncSession,
    change: Change,
    to_status: ChangeStatus,
    *,
    from_status: Optional[ChangeStatus] = None,
    revision: Optional[ChangeRevision] = None,
    actor_user_id: Optional[str] = None,
    actor_type: AuditActorType = AuditActorType.USER,
    reason: Optional[str] = None,
) -> ChangeStatusTransition:
    """Append a status transition row (does not commit)."""
    transition = ChangeStatusTransition(
        change_id=change.id,
        revision_id=revision.id if revision is not None else None,
        from_status=from_status,
        to_status=to_status,
        reason=reason,
        actor_user_id=actor_user_id,
        actor_type=actor_type.value,
    )
    session.add(transition)
    return transition


def _audit(session, change, user_id, action, event_data=None):
    session.add(
        AuditEvent(
            actor_user_id=user_id,
            actor_type=AuditActorType.USER.value,
            action=action,
            object_type="CHANGE",
            object_id=change.id,
            event_data=event_data or {},
        )
    )


async def create_change(session: AsyncSession, data: dict, requester_id: str) -> Change:
    """Create a draft change request with revision 1."""
    year = datetime.now(timezone.utc).year
    max_num = (
        await session.execute(
            select(func.max(Change.change_number)).where(Change.change_number.like(f"CHG-{year}-%"))
        )
    ).scalar_one_or_none()
    num = int(max_num.split("-")[-1]) + 1 if max_num else 1
    change_number = f"CHG-{year}-{num:06d}"

    change = Change(
        change_number=change_number,
        title=data["title"],
        description=data.get("description"),
        category=data["category"],
        change_type=data.get("change_type", ChangeType.NORMAL.value),
        business_justification=data.get("business_justification"),
        affected_services=data.get("affected_services", []),
        affected_devices=data.get("affected_devices", []),
        environment=data.get("environment", Environment.TEST.value),
        implementation_start=data.get("implementation_start"),
        implementation_end=data.get("implementation_end"),
        impact_description=data.get("impact_description"),
        implementation_plan=data.get("implementation_plan"),
        test_plan=data.get("test_plan"),
        rollback_plan=data.get("rollback_plan"),
        communication_plan=data.get("communication_plan"),
        emergency_justification=data.get("emergency_justification"),
        emergency_incident_ref=data.get("emergency_incident_ref"),
        requester_id=requester_id,
        status=ChangeStatus.DRAFT,
    )
    session.add(change)
    await session.flush()  # need change.id for revision + timeline FKs

    snapshot = snapshot_of(change)
    revision = ChangeRevision(
        change_id=change.id,
        revision_number=1,
        snapshot=snapshot,
        content_hash=snapshot_hash(snapshot),
        is_current=True,
        created_by_id=requester_id,
    )
    session.add(revision)
    await session.flush()

    record_transition(
        session, change, ChangeStatus.DRAFT, from_status=None, revision=revision, actor_user_id=requester_id
    )
    _audit(session, change, requester_id, "change.created", {"change_number": change_number})

    await session.commit()
    # Reload with relationships so callers never trigger lazy IO.
    reloaded = await get_change(session, change.id)
    return reloaded or change


def latest_risk_level(change) -> Optional[str]:
    """Current risk band from the newest assessment; None means not yet assessed."""
    rows = list(getattr(change, "risk_assessments", None) or [])
    if not rows:
        return None
    latest = max(rows, key=lambda r: r.calculated_at.timestamp() if r.calculated_at else 0)
    return _enum_value(latest.risk_level)


async def list_changes(
    session: AsyncSession,
    page: int = 1,
    page_size: Optional[int] = 20,
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    change_type: Optional[str] = None,
    environment: Optional[str] = None,
    requester_id: Optional[str] = None,
    search: Optional[str] = None,
    include_deleted: bool = False,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
) -> dict:
    """List changes with filters and pagination."""
    query = select(Change).options(
        selectinload(Change.current_revision),
        selectinload(Change.requester),
        selectinload(Change.risk_assessments),
    )
    total_query = select(func.count(Change.id))

    # Deleted RFCs are gone for everyone; include_deleted only serves the audit view.
    if not include_deleted:
        query = query.where(Change.deleted_at.is_(None))
        total_query = total_query.where(Change.deleted_at.is_(None))

    if status_filter:
        query = query.where(Change.status == status_filter)
        total_query = total_query.where(Change.status == status_filter)
    if category:
        query = query.where(Change.category == category)
        total_query = total_query.where(Change.category == category)
    if change_type:
        query = query.where(Change.change_type == change_type)
        total_query = total_query.where(Change.change_type == change_type)
    if environment:
        query = query.where(Change.environment == environment)
        total_query = total_query.where(Change.environment == environment)
    if requester_id:
        query = query.where(Change.requester_id == requester_id)
        total_query = total_query.where(Change.requester_id == requester_id)
    if search:
        cond = Change.title.ilike(f"%{search}%") | Change.change_number.ilike(f"%{search}%")
        query = query.where(cond)
        total_query = total_query.where(cond)
    if from_date:
        d = datetime.fromisoformat(from_date)
        query = query.where(Change.created_at >= d)
        total_query = total_query.where(Change.created_at >= d)
    if to_date:
        d = datetime.fromisoformat(to_date)
        query = query.where(Change.created_at < d + timedelta(days=1))
        total_query = total_query.where(Change.created_at < d + timedelta(days=1))

    query = query.order_by(Change.updated_at.desc())
    if page_size:
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

    total = (await session.execute(total_query)).scalar() or 0
    changes = (await session.execute(query)).scalars().all()

    change_ids = [c.id for c in changes]
    reviewer_map: dict = {}
    approver_map: dict = {}

    if change_ids:
        # Batch-fetch reviewer names from review_results.decided_by_id
        from app.models import ReviewResult, ReviewJob

        job_ids = (
            await session.execute(
                select(ReviewJob.id).where(ReviewJob.change_id.in_(change_ids))
            )
        ).scalars().all()
        if job_ids:
            rows = (
                await session.execute(
                    select(ReviewJob.change_id, User.username).join(
                        ReviewResult, ReviewJob.id == ReviewResult.review_job_id
                    ).join(
                        User, ReviewResult.decided_by_id == User.id, isouter=True
                    ).where(ReviewJob.id.in_(job_ids))
                )
            ).all()
            reviewer_map = {str(rid): uname for rid, uname in rows if uname}

        # Batch-fetch approver names from approval_tasks
        from app.models import ApprovalTask, ApprovalTaskStatus, WorkflowInstance

        wf_ids = (
            await session.execute(
                select(WorkflowInstance.id).where(WorkflowInstance.change_id.in_(change_ids))
            )
        ).scalars().all()
        if wf_ids:
            rows = (
                await session.execute(
                    select(
                        ApprovalTask.workflow_instance_id,
                        User.username,
                    )
                    .join(User, ApprovalTask.decided_by_id == User.id, isouter=True)
                    .where(
                        ApprovalTask.workflow_instance_id.in_(wf_ids),
                        ApprovalTask.status == ApprovalTaskStatus.APPROVED,
                        ApprovalTask.decided_by_id.isnot(None),
                    )
                    .order_by(ApprovalTask.decided_at.desc())
                )
            ).all()
            # Keep last approved per workflow
            seen: dict = {}
            for wf_id, uname in rows:
                seen[str(wf_id)] = uname
            # Map workflow -> change
            wf_to_change = {
                str(wf.id): str(wf.change_id)
                for wf in (
                    await session.execute(select(WorkflowInstance).where(WorkflowInstance.id.in_(wf_ids)))
                ).scalars()
            }
            for wf_id, uname in seen.items():
                cid = wf_to_change.get(wf_id)
                if cid and cid not in approver_map:
                    approver_map[cid] = uname

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": str(c.id),
                "change_number": c.change_number,
                "title": c.title,
                "description": c.description,
                "category": _enum_value(c.category),
                "change_type": _enum_value(c.change_type),
                "environment": _enum_value(c.environment),
                "status": _enum_value(c.status),
                "risk_level": latest_risk_level(c),
                "requester_id": str(c.requester_id),
                "requester_name": (c.requester.display_name or c.requester.username) if c.requester else None,
                "current_revision_number": c.current_revision.revision_number if c.current_revision else None,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
                "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
                "reviewer_name": reviewer_map.get(str(c.id)),
                "approver_name": approver_map.get(str(c.id)),
            }
            for c in changes
        ],
    }


async def get_change(session: AsyncSession, change_id: str) -> Optional[Change]:
    result = await session.execute(
        select(Change)
        .options(
            selectinload(Change.revisions),
            selectinload(Change.requester),
            selectinload(Change.status_transitions),
            selectinload(Change.risk_assessments),
        )
        .where(Change.id == change_id)
    )
    return result.scalar_one_or_none()


async def get_current_revision(session: AsyncSession, change_id) -> Optional[ChangeRevision]:
    result = await session.execute(
        select(ChangeRevision)
        .where(ChangeRevision.change_id == change_id, ChangeRevision.is_current == True)  # noqa: E712
        .order_by(ChangeRevision.revision_number.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def update_change(session: AsyncSession, change: Change, data: dict, user_id: str) -> Change:
    """Update a draft change. Only allowed while DRAFT.

    A locked revision (one already submitted once) is never mutated: editing it
    creates a new working revision instead.
    """
    if change.status != ChangeStatus.DRAFT:
        raise ValueError(f"Cannot update change in status: {_enum_value(change.status)}")

    for field in UPDATABLE_FIELDS:
        if field in data and data[field] is not None:
            setattr(change, field, data[field])

    current = await get_current_revision(session, change.id)
    if current is not None and current.locked_at is not None:
        await create_new_revision(session, change, user_id, reason="edited draft")
    elif current is not None:
        # Same draft revision: keep the snapshot in step with the change row.
        snapshot = snapshot_of(change)
        current.snapshot = snapshot
        current.content_hash = snapshot_hash(snapshot)

    _audit(session, change, user_id, "change.updated", {"fields": sorted(set(data) & set(UPDATABLE_FIELDS))})

    await session.commit()
    reloaded = await get_change(session, change.id)
    return reloaded or change


async def create_new_revision(
    session: AsyncSession,
    change: Change,
    user_id: str,
    reason: Optional[str] = None,
) -> ChangeRevision:
    """Close the current revision and create the next one (does not commit).

    Returns the new revision, or the existing current one if content is unchanged.
    """
    current = await get_current_revision(session, change.id)
    snapshot = snapshot_of(change)
    new_hash = snapshot_hash(snapshot)

    if current and current.content_hash == new_hash:
        return current

    if current:
        current.is_current = False
        current.locked_at = datetime.now(timezone.utc)

    next_number = (current.revision_number + 1) if current else 1
    revision = ChangeRevision(
        change_id=change.id,
        revision_number=next_number,
        snapshot=snapshot,
        content_hash=new_hash,
        is_current=True,
        created_by_id=user_id,
    )
    session.add(revision)
    await session.flush()

    _audit(
        session,
        change,
        user_id,
        "change.revision_created",
        {"revision_number": next_number, "content_hash": new_hash, "reason": reason},
    )
    return revision


async def get_change_history(session: AsyncSession, change_id: str) -> dict:
    """Status timeline, revisions and audit events for a change."""
    transitions = (
        await session.execute(
            select(ChangeStatusTransition)
            .where(ChangeStatusTransition.change_id == change_id)
            .order_by(ChangeStatusTransition.occurred_at)
        )
    ).scalars().all()

    revisions = (
        await session.execute(
            select(ChangeRevision)
            .where(ChangeRevision.change_id == change_id)
            .order_by(ChangeRevision.revision_number)
        )
    ).scalars().all()

    events = (
        await session.execute(
            select(AuditEvent)
            .where(AuditEvent.object_type == "CHANGE", AuditEvent.object_id == change_id)
            .order_by(AuditEvent.occurred_at)
        )
    ).scalars().all()

    user_ids = {t.actor_user_id for t in transitions if t.actor_user_id} | {
        e.actor_user_id for e in events if e.actor_user_id
    }
    actor_names: dict = {}
    if user_ids:
        rows = (
            await session.execute(select(User.id, User.username).where(User.id.in_(user_ids)))
        ).all()
        actor_names = {str(uid): username for uid, username in rows}

    return {
        "status_history": [
            {
                "id": str(t.id),
                "from_status": _enum_value(t.from_status),
                "to_status": _enum_value(t.to_status),
                "revision_id": str(t.revision_id) if t.revision_id else None,
                "actor_user_id": str(t.actor_user_id) if t.actor_user_id else None,
                "actor_name": actor_names.get(str(t.actor_user_id)) if t.actor_user_id else None,
                "actor_type": t.actor_type,
                "reason": t.reason,
                "occurred_at": t.occurred_at.isoformat() if t.occurred_at else None,
            }
            for t in transitions
        ],
        "revisions": [
            {
                "id": str(r.id),
                "revision_number": r.revision_number,
                "content_hash": r.content_hash,
                "is_current": r.is_current,
                "locked": r.locked_at is not None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in revisions
        ],
        "events": [
            {
                "id": str(e.id),
                "action": e.action,
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "actor_name": actor_names.get(str(e.actor_user_id)) if e.actor_user_id else None,
                "actor_type": _enum_value(e.actor_type),
                "event_data": e.event_data,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
            }
            for e in events
        ],
    }


# Statuses whose history must stay (an executed or decided change is a record, not a draft).
PROTECTED_STATUSES = {
    ChangeStatus.APPROVED,
    ChangeStatus.SCHEDULED,
    ChangeStatus.IN_PROGRESS,
    ChangeStatus.VALIDATION,
    ChangeStatus.COMPLETED,
    ChangeStatus.CLOSED,
}


def purge_blob(object_key: str) -> None:
    """Remove a stored document file. Best effort: a missing file must not block a delete."""
    from app.integrations.storage.storage import get_storage

    try:
        get_storage().delete(object_key)
    except Exception:
        pass


def _require_deletable(change: Change) -> None:
    if change.deleted_at is not None:
        return
    if change.status in PROTECTED_STATUSES:
        raise ValueError(
            f"Perubahan berstatus {change.status.value} tidak bisa dihapus; batalkan atau tutup saja."
        )


async def delete_change(session: AsyncSession, change_id: str, user_id: str) -> Change:
    """Soft-delete one change and record who did it."""
    change = await get_change(session, change_id)
    if not change:
        raise LookupError("Change not found")
    _require_deletable(change)
    if change.deleted_at is None:
        change.deleted_at = datetime.now(timezone.utc)
        change.deleted_by_id = user_id
        _audit(session, change, user_id, "change.deleted", {"change_number": change.change_number})
        await session.commit()
    return change


async def purge_deleted(
    session: AsyncSession, delete_blobs: bool = True
) -> dict:
    """Hard-delete changes that were soft-deleted and are safely reversible."""
    from sqlalchemy import delete as sa_delete
    from app.models import (
        ApprovalTask,
        ChangeRevision,
        Document,
        RiskAssessment,
        WorkflowInstance,
        ReviewJob,
    )

    candidates = (
        await session.execute(
            select(Change)
            .options(selectinload(Change.documents))
            .where(Change.deleted_at.is_not(None), Change.status.notin_(PROTECTED_STATUSES))
        )
    ).scalars().unique().all()

    purged = 0
    for change in candidates:
        if delete_blobs:
            for doc in change.documents:
                purge_blob(doc.object_key)

        # Documents first: they reference revisions, which reference the change.
        await session.execute(sa_delete(Document).where(Document.change_id == change.id))
        instance_ids = select(WorkflowInstance.id).where(WorkflowInstance.change_id == change.id)
        await session.execute(sa_delete(ApprovalTask).where(ApprovalTask.workflow_instance_id.in_(instance_ids)))
        await session.execute(sa_delete(WorkflowInstance).where(WorkflowInstance.change_id == change.id))
        # review_results/findings/risk cascade from review_jobs via ORM delete.
        for job in (await session.execute(select(ReviewJob).where(ReviewJob.change_id == change.id))).scalars():
            await session.delete(job)
        await session.execute(sa_delete(RiskAssessment).where(RiskAssessment.change_id == change.id))
        await session.execute(sa_delete(ChangeRevision).where(ChangeRevision.change_id == change.id))
        # approved_revision_id is dropped together with the change row.
        await session.delete(change)
        purged += 1

    await session.commit()
    return {"purged": purged, "skipped": 0}
