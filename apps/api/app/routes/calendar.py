"""Change calendar: window listing, filters, and honest conflict detection (Stage 5)."""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.models import Change, ChangeStatus

router = APIRouter(prefix="/calendar", tags=["calendar"])

# Statuses that do not occupy a maintenance window.
INACTIVE_STATUSES = [
    ChangeStatus.DRAFT,
    ChangeStatus.CANCELLED,
    ChangeStatus.CLOSED,
    ChangeStatus.REJECTED,
    ChangeStatus.REVISION_REQUIRED,
    ChangeStatus.STALE,
    ChangeStatus.REVIEW_FAILED,
]


def _enum(v):
    return v.value if hasattr(v, "value") else v


def _item(c: Change) -> dict:
    return {
        "id": str(c.id),
        "change_number": c.change_number,
        "title": c.title,
        "status": _enum(c.status),
        "implementation_start": c.implementation_start.isoformat() if c.implementation_start else None,
        "implementation_end": c.implementation_end.isoformat() if c.implementation_end else None,
        "category": _enum(c.category),
        "environment": _enum(c.environment),
        "affected_devices": c.affected_devices or [],
        "affected_services": c.affected_services or [],
    }


def _window_filter(from_date: datetime, to_date: datetime):
    return (
        Change.implementation_start.isnot(None),
        Change.implementation_start <= to_date,
        # A window without an end still occupies the day it starts.
        (Change.implementation_end.is_(None)) | (Change.implementation_end >= from_date),
        Change.status.notin_(INACTIVE_STATUSES),
    )


@router.get("/changes")
async def get_calendar_changes(
    from_date: datetime = Query(..., alias="from"),
    to_date: datetime = Query(..., alias="to"),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Changes active inside the window, with optional filters."""
    query = select(Change).where(*_window_filter(from_date, to_date))
    if status:
        query = query.where(Change.status == status)
    if category:
        query = query.where(Change.category == category)
    if environment:
        query = query.where(Change.environment == environment)
    if owner:
        query = query.where(Change.requester_id == owner)

    changes = (await session.execute(query.order_by(Change.implementation_start))).scalars().all()
    return {"items": [_item(c) for c in changes]}


@router.get("/conflicts")
async def check_conflicts(
    from_date: datetime = Query(..., alias="from"),
    to_date: datetime = Query(..., alias="to"),
    exclude_change_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Changes in the window that share a device or service.

    A pair is only reported when both changes name at least one device or service;
    when the data is absent the answer is `INDETERMINATE`, never "no conflict".
    """
    query = select(Change).where(*_window_filter(from_date, to_date))
    changes = (await session.execute(query)).scalars().all()

    candidates = [c for c in changes if str(c.id) != exclude_change_id]
    without_data = [
        c.change_number
        for c in candidates
        if not (c.affected_devices or []) and not (c.affected_services or [])
    ]

    conflicts = []
    for i, a in enumerate(candidates):
        for b in candidates[i + 1 :]:
            shared_devices = sorted(set(a.affected_devices or []) & set(b.affected_devices or []))
            shared_services = sorted(set(a.affected_services or []) & set(b.affected_services or []))
            if shared_devices or shared_services:
                conflicts.append(
                    {
                        "changes": [a.change_number, b.change_number],
                        "shared_devices": shared_devices,
                        "shared_services": shared_services,
                        "overlap_start": max(a.implementation_start, b.implementation_start).isoformat(),
                        "overlap_end": min(
                            x for x in (a.implementation_end, b.implementation_end) if x is not None
                        ).isoformat()
                        if a.implementation_end and b.implementation_end
                        else None,
                    }
                )

    if conflicts:
        verdict = "CONFLICT"
    elif without_data:
        verdict = "INDETERMINATE"
    else:
        verdict = "NO_CONFLICT"

    return {
        "verdict": verdict,
        "conflicts": conflicts,
        "changes_without_dependency_data": without_data,
        "note": (
            "Data dependensi perangkat/layanan belum lengkap untuk sebagian perubahan; "
            "hasil bersih tidak dapat diklaim untuk perubahan tersebut."
            if without_data
            else "Semua perubahan pada rentang ini mencantumkan perangkat atau layanan yang terdampak."
        ),
    }


@router.get("/overlaps")
async def check_overlaps(
    from_date: datetime = Query(..., alias="from"),
    to_date: datetime = Query(..., alias="to"),
    device: Optional[str] = Query(None),
    service: Optional[str] = Query(None),
    exclude_change_id: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Changes in the window touching a given device or service."""
    query = select(Change).where(*_window_filter(from_date, to_date))
    if device:
        query = query.where(Change.affected_devices.contains([device]))
    if service:
        query = query.where(Change.affected_services.contains([service]))
    if exclude_change_id:
        query = query.where(Change.id != exclude_change_id)

    overlaps = (await session.execute(query)).scalars().all()
    # Without a selector the result is the whole window, not a conflict claim.
    return {
        "selector_supplied": bool(device or service),
        "overlaps": [_item(c) for c in overlaps],
        "count": len(overlaps),
    }
