from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.models import (
    ApprovalDecision,
    ApprovalTask,
    ApprovalTaskStatus,
    Change,
    ChangeStatus,
    RiskAssessment,
    Role,
    WorkflowInstance,
)
from app.services import audit_service, change_service, workflow_service
from app.services.workflow_service import TransitionError

router = APIRouter(prefix="/approvals", tags=["approvals"])


async def _may_decide(user, task: ApprovalTask) -> bool:
    """Named assignee, or holder of the assigned role."""
    if task.assigned_user_id is not None:
        return task.assigned_user_id == user.id
    if task.assigned_role_id is not None:
        return task.assigned_role_id in {ur.role_id for ur in user.roles if ur.role}
    return False


async def _workflow_change(session: AsyncSession, task: ApprovalTask) -> Change | None:
    wf = (
        await session.execute(select(WorkflowInstance).where(WorkflowInstance.id == task.workflow_instance_id))
    ).scalar_one_or_none()
    if not wf:
        return None
    return await change_service.get_change(session, wf.change_id)


async def _role_names(session: AsyncSession, tasks: list[ApprovalTask]) -> dict:
    role_ids = {t.assigned_role_id for t in tasks if t.assigned_role_id}
    if not role_ids:
        return {}
    roles = (await session.execute(select(Role).where(Role.id.in_(role_ids)))).scalars().all()
    return {r.id: r.name for r in roles}


@router.get("/inbox")
async def get_inbox(
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Pending approval tasks assigned to this user, directly or by role.

    `actionable` is false while an earlier step of the same workflow is still
    waiting: tasks are sequential, not parallel.
    """
    role_ids = [ur.role_id for ur in user.roles if ur.role]
    condition = ApprovalTask.assigned_user_id == user.id
    if role_ids:
        condition = condition | ApprovalTask.assigned_role_id.in_(role_ids)

    tasks = (
        await session.execute(
            select(ApprovalTask)
            .where(ApprovalTask.status == ApprovalTaskStatus.PENDING, condition)
            .order_by(ApprovalTask.step_order, ApprovalTask.created_at)
        )
    ).scalars().all()

    names = await _role_names(session, tasks)
    items = []
    for task in tasks:
        change = await _workflow_change(session, task)
        items.append(
            {
                "id": str(task.id),
                "step_code": task.step_code,
                "step_order": task.step_order,
                "role_name": names.get(task.assigned_role_id),
                "revision_id": str(task.revision_id) if task.revision_id else None,
                "status": task.status.value,
                "due_at": task.due_at.isoformat() if task.due_at else None,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "actionable": await workflow_service.is_task_open(session, task),
                "change": {
                    "id": str(change.id),
                    "change_number": change.change_number,
                    "title": change.title,
                    "status": change.status.value,
                    "risk_level": await _risk_level(session, change),
                }
                if change
                else None,
            }
        )

    return {"pending_count": len(items), "tasks": items}


async def _risk_level(session: AsyncSession, change: Change) -> str | None:
    """Risk level of the current revision's assessment, if one exists."""
    current = await change_service.get_current_revision(session, change.id)
    assessment = (
        await session.execute(
            select(RiskAssessment)
            .where(
                RiskAssessment.change_id == change.id,
                RiskAssessment.revision_id == (current.id if current else None),
            )
            .order_by(RiskAssessment.calculated_at.desc())
            .limit(1)
        )
    ).scalars().first()
    return assessment.risk_level if assessment else None


@router.get("/tasks/{task_id}", response_model=dict)
async def get_task_detail(
    task_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Detail of an approval task with the change, revision and step timeline."""
    task = (
        await session.execute(select(ApprovalTask).where(ApprovalTask.id == task_id))
    ).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    wf = (
        await session.execute(select(WorkflowInstance).where(WorkflowInstance.id == task.workflow_instance_id))
    ).scalar_one_or_none()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    change = await change_service.get_change(session, wf.change_id)
    steps = (
        await session.execute(
            select(ApprovalTask)
            .where(ApprovalTask.workflow_instance_id == task.workflow_instance_id)
            .order_by(ApprovalTask.step_order)
        )
    ).scalars().all()
    names = await _role_names(session, steps)
    current = await change_service.get_current_revision(session, change.id) if change else None

    return {
        "task": {
            "id": str(task.id),
            "step_code": task.step_code,
            "step_order": task.step_order,
            "role_name": names.get(task.assigned_role_id),
            "revision_id": str(task.revision_id) if task.revision_id else None,
            "status": task.status.value,
            "due_at": task.due_at.isoformat() if task.due_at else None,
            "decision": task.decision.value if task.decision else None,
            "comment": task.comment,
            "decided_at": task.decided_at.isoformat() if task.decided_at else None,
            "actionable": task.status == ApprovalTaskStatus.PENDING
            and await _may_decide(user, task)
            and await workflow_service.is_task_open(session, task),
        },
        "workflow": {"id": str(wf.id), "status": wf.status.value, "current_step": wf.current_step},
        "change": {
            "id": str(change.id),
            "change_number": change.change_number,
            "title": change.title,
            "description": change.description,
            "category": change.category.value,
            "change_type": change.change_type.value,
            "environment": change.environment.value,
            "status": change.status.value,
            "requester_id": str(change.requester_id),
            "risk_level": await _risk_level(session, change),
            "business_justification": change.business_justification,
            "impact_description": change.impact_description,
            "implementation_plan": change.implementation_plan,
            "test_plan": change.test_plan,
            "rollback_plan": change.rollback_plan,
            "affected_devices": change.affected_devices or [],
            "affected_services": change.affected_services or [],
            # The approver must see when the task no longer matches the content.
            "revision_number": current.revision_number if current else None,
            "task_is_stale": bool(task.revision_id and current and task.revision_id != current.id),
        }
        if change
        else None,
        "workflow_steps": [
            {
                "id": str(t.id),
                "step_code": t.step_code,
                "step_order": t.step_order,
                "role_name": names.get(t.assigned_role_id),
                "status": t.status.value,
                "decision": t.decision.value if t.decision else None,
                "comment": t.comment,
                "decided_at": t.decided_at.isoformat() if t.decided_at else None,
            }
            for t in steps
        ],
    }


@router.post("/tasks/{task_id}/decision")
async def make_decision(
    task_id: str,
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Record an approval decision. Decisions are immutable once made."""
    decision = body.get("decision")
    comment = body.get("comment")

    if decision not in ("APPROVE", "REJECT", "REQUEST_REVISION"):
        raise HTTPException(status_code=400, detail="Invalid decision. Must be APPROVE, REJECT, or REQUEST_REVISION")
    if decision in ("REJECT", "REQUEST_REVISION") and not (comment and comment.strip()):
        raise HTTPException(status_code=400, detail="Comment required for REJECT and REQUEST_REVISION")

    task = (
        await session.execute(select(ApprovalTask).where(ApprovalTask.id == task_id))
    ).scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if not await _may_decide(user, task):
        raise HTTPException(status_code=403, detail="Not authorized for this task")
    if task.status != ApprovalTaskStatus.PENDING:
        raise HTTPException(status_code=400, detail="Task is not pending")
    if not await workflow_service.is_task_open(session, task):
        raise HTTPException(status_code=409, detail="An earlier approval step is still pending")

    change = await _workflow_change(session, task)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")

    # SoD: a requester may not approve their own change.
    if decision == "APPROVE" and change.requester_id == user.id:
        raise HTTPException(status_code=403, detail="Requester cannot approve their own change")

    # Stale approval: the task must target the change's current revision.
    current = await change_service.get_current_revision(session, change.id)
    if task.revision_id and current and task.revision_id != current.id:
        raise HTTPException(status_code=409, detail="Approval task targets a superseded revision")

    task.status = {
        "APPROVE": ApprovalTaskStatus.APPROVED,
        "REJECT": ApprovalTaskStatus.REJECTED,
        "REQUEST_REVISION": ApprovalTaskStatus.REVISION_REQUESTED,
    }[decision]
    task.decision = ApprovalDecision(decision)
    task.decided_by_id = user.id
    task.comment = comment
    task.decided_at = datetime.now(timezone.utc)

    await audit_service.create_audit_event(
        session=session,
        action="approval.decision",
        object_type="APPROVAL_TASK",
        object_id=str(task_id),
        user_id=str(user.id),
        event_data={
            "decision": decision,
            "comment": comment,
            "revision_id": str(task.revision_id) if task.revision_id else None,
            "step_code": task.step_code,
        },
    )

    next_step = None
    try:
        if decision == "REJECT":
            await workflow_service.reject_change(session, str(change.id), str(user.id), comment)
        elif decision == "REQUEST_REVISION":
            await workflow_service.require_revision(session, str(change.id), str(user.id), comment)
        else:
            next_step = await workflow_service.unlock_next_step(session, task)
            await session.flush()
            if change.status == ChangeStatus.PENDING_APPROVAL:
                # Only succeeds once every step has approved; otherwise the change stays pending.
                try:
                    await workflow_service.approve_change(session, str(change.id), str(user.id))
                except TransitionError:
                    pass
    except TransitionError:
        pass

    await session.commit()
    await session.refresh(change)
    return {
        "status": "ok",
        "decision": decision,
        "change_status": change.status.value,
        "next_step": next_step,
    }
