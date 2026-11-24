"""Implementation, outcome and PIR endpoints (Stage 5).

Every state change goes through workflow_service; this layer only maps HTTP.
"""

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.models import ImplementationRecord
from app.services import change_service, workflow_service

router = APIRouter(prefix="/changes/{change_id}/implementation", tags=["implementation"])


class OutcomeRequest(BaseModel):
    outcome: Literal["SUCCESSFUL", "SUCCESSFUL_WITH_DEVIATION", "FAILED", "ROLLED_BACK"]
    notes: Optional[str] = None
    post_check_passed: Optional[bool] = None
    evidence: Optional[list[str]] = Field(default=None, max_length=20)


class PirRequest(BaseModel):
    notes: str = Field(min_length=1)
    post_check_passed: bool = True
    service_validation: Optional[str] = None


def _record(record: ImplementationRecord) -> dict:
    return {
        "id": str(record.id),
        "actual_start": record.actual_start.isoformat() if record.actual_start else None,
        "actual_end": record.actual_end.isoformat() if record.actual_end else None,
        "outcome": record.outcome.value if record.outcome else None,
        "implementer_id": str(record.implementer_id) if record.implementer_id else None,
        "execution_notes": record.execution_notes,
        "precheck": record.precheck,
        "postcheck": record.postcheck,
        "rollback_performed": bool(record.rollback_performed),
    }


@router.post("", response_model=dict, status_code=201)
async def create_implementation(
    change_id: str,
    body: Optional[dict] = None,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Start implementation (alias of /start). Refused when the gate is not satisfied."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    try:
        record = await workflow_service.start_implementation(
            session, change_id, str(user.id), notes=(body or {}).get("execution_notes") or (body or {}).get("notes")
        )
    except workflow_service.TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"id": str(record.id), "status": "ok", "record": _record(record)}


@router.get("", response_model=dict)
async def get_implementation(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    record = (
        await session.execute(select(ImplementationRecord).where(ImplementationRecord.change_id == change_id))
    ).scalar_one_or_none()
    return {"record": _record(record) if record else None}


@router.post("/start", response_model=dict, status_code=201)
async def start_implementation(
    change_id: str,
    body: Optional[dict] = None,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """SCHEDULED -> IN_PROGRESS. Refused when the execution gate is not satisfied."""
    try:
        record = await workflow_service.start_implementation(
            session, change_id, str(user.id), notes=(body or {}).get("notes")
        )
    except workflow_service.TransitionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"record": _record(record)}


@router.post("/outcome", response_model=dict)
async def record_outcome(
    change_id: str,
    body: OutcomeRequest,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Record the implementation outcome; this decides VALIDATION / FAILED / ROLLED_BACK."""
    try:
        record = await workflow_service.record_outcome(
            session,
            change_id,
            str(user.id),
            outcome=body.outcome,
            notes=body.notes,
            post_check_passed=body.post_check_passed,
            evidence=body.evidence,
        )
    except workflow_service.TransitionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"record": _record(record)}


@router.post("/pir", response_model=dict)
async def create_pir(
    change_id: str,
    body: PirRequest,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """VALIDATION -> COMPLETED. A failed post-check never completes a change."""
    try:
        change = await workflow_service.submit_pir(session, change_id, str(user.id), body.model_dump())
    except workflow_service.TransitionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"status": change.status.value}


@router.post("/close", response_model=dict)
async def close_change(
    change_id: str,
    body: Optional[dict] = None,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """COMPLETED -> CLOSED."""
    try:
        change = await workflow_service.close_change(
            session, change_id, str(user.id), reason=(body or {}).get("reason")
        )
    except workflow_service.TransitionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {"status": change.status.value}
