from typing import Optional

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user, has_any_role, require_role
from app.db.session import get_async_session
from app.schemas.change import (
    ApproveRequest,
    ChangeCreate,
    ChangeListResponse,
    ChangeResponse,
    ChangeUpdate,
    DecisionRequest,
    SubmitRequest,
    CancelRequest,
)
from app.services import change_service, workflow_service
from app.services.workflow_service import TransitionError

router = APIRouter(prefix="/changes", tags=["changes"])


def _enum(v):
    return v.value if hasattr(v, "value") else v


def _to_response(change, requester=None) -> ChangeResponse:
    r = requester or getattr(change, "requester", None)
    revisions = list(getattr(change, "revisions", None) or [])
    current = next((rev for rev in revisions if rev.is_current), None)
    return ChangeResponse(
        id=str(change.id),
        change_number=change.change_number,
        title=change.title,
        description=change.description,
        category=_enum(change.category),
        change_type=_enum(change.change_type),
        business_justification=change.business_justification,
        affected_services=change.affected_services or [],
        affected_devices=change.affected_devices or [],
        environment=_enum(change.environment),
        implementation_start=change.implementation_start,
        implementation_end=change.implementation_end,
        impact_description=change.impact_description,
        implementation_plan=change.implementation_plan,
        test_plan=change.test_plan,
        rollback_plan=change.rollback_plan,
        communication_plan=change.communication_plan,
        requester_id=str(change.requester_id),
        requester_name=(r.display_name or r.username) if r else None,
        status=_enum(change.status),
        risk_level=change_service.latest_risk_level(change),
        current_revision_number=current.revision_number if current else None,
        created_at=change.created_at,
        updated_at=change.updated_at,
        submitted_at=change.submitted_at,
        approved_at=change.approved_at,
    )


def _brief(change) -> dict:
    return {
        "id": str(change.id),
        "change_number": change.change_number,
        "status": _enum(change.status),
    }


@router.post("", response_model=ChangeResponse, status_code=201)
async def create_change(
    body: ChangeCreate,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Create a draft change request."""
    try:
        change = await change_service.create_change(session, body.model_dump(), str(user.id))
        return _to_response(change, requester=user)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=ChangeListResponse)
async def list_changes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    category: str | None = Query(None),
    change_type: str | None = Query(None),
    environment: str | None = Query(None),
    requester_id: str | None = Query(None),
    search: str | None = Query(None),
    include_deleted: bool = Query(False),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """List changes with filters and pagination."""
    return await change_service.list_changes(
        session,
        page=page,
        page_size=page_size,
        status_filter=status,
        category=category,
        change_type=change_type,
        environment=environment,
        requester_id=requester_id,
        search=search,
        include_deleted=include_deleted and has_any_role(user, "ADMIN", "AUDITOR"),
    )


@router.get("/export")
async def export_changes_csv(
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    change_type: Optional[str] = Query(None),
    environment: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Export changes as CSV (no pagination, all matching rows)."""
    import csv, io

    listing = await change_service.list_changes(
        session, page=1, page_size=None,
        status_filter=status, category=category, change_type=change_type,
        environment=environment, search=search, include_deleted=False,
        from_date=from_date, to_date=to_date,
    )
    rows = listing["items"]
    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\r\n")
    STATUS_LABELS = {
        "DRAFT": "Draf", "SUBMITTED": "Diajukan", "DOCUMENT_VALIDATION": "Validasi Dokumen",
        "AI_REVIEW": "Tinjauan AI", "REVIEW_FAILED": "Tinjauan Gagal",
        "PENDING_APPROVAL": "Menunggu Persetujuan", "REVISION_REQUIRED": "Perlu Revisi",
        "REJECTED": "Ditolak", "APPROVED": "Disetujui", "SCHEDULED": "Terjadwal",
        "IN_PROGRESS": "Sedang Dieksekusi", "VALIDATION": "Validasi Pasca-Eksekusi",
        "COMPLETED": "Selesai", "CLOSED": "Ditutup", "CANCELLED": "Dibatalkan",
        "STALE": "Kedaluwarsa",
    }
    CATEGORY_LABELS = {
        "NETWORK": "Jaringan", "SERVER": "Server", "APPLICATION": "Aplikasi",
        "DATABASE": "Basis Data", "SECURITY": "Keamanan", "INFRASTRUCTURE": "Infrastruktur",
        "OTHER": "Lainnya",
    }
    writer.writerow([
        "Change ID", "Judul", "Status", "Risiko", "Kategori", "Tipe", "Lingkungan",
        "Pemohon", "Dibuat", "Diperbarui", "DIRENCANAKAN MULAI", "DIRENCANAKAN SELESAI",
    ])
    for r in rows:
        writer.writerow([
            r["change_number"], r["title"], STATUS_LABELS.get(r["status"], r["status"]),
            r["risk_level"] or "", CATEGORY_LABELS.get(r["category"], r["category"]),
            r["change_type"] or "", r["environment"] or "", r["requester_name"] or "",
            r["created_at"] or "", r["updated_at"] or "",
            r.get("implementation_start", "") or "", r.get("implementation_end", "") or "",
        ])
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=\"laporan-perubahan.csv\""},
    )


@router.get("/{change_id}", response_model=ChangeResponse)
async def get_change(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Get change detail."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    if change.deleted_at is not None and not has_any_role(user, "ADMIN", "AUDITOR"):
        raise HTTPException(status_code=404, detail="Change not found")
    return _to_response(change)


@router.patch("/{change_id}")
async def update_change(
    change_id: str,
    body: ChangeUpdate,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Update a draft change (same revision)."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    try:
        updated = await change_service.update_change(session, change, body.model_dump(exclude_unset=True), str(user.id))
        return _brief(updated)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{change_id}/submit")
async def submit_change(
    change_id: str,
    body: SubmitRequest | None = None,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Submit a draft: locks a revision, then queues the AI review."""
    try:
        change = await workflow_service.submit_change(
            session, change_id, str(user.id), reason=body.reason if body else None
        )
        # Auto-advance: SUBMITTED -> DOCUMENT_VALIDATION -> AI_REVIEW (MVP has no async doc pipeline).
        change = await workflow_service.advance_document_validation(session, change_id, str(user.id))
        change = await workflow_service.advance_ai_review(session, change_id, str(user.id))

        from app.services import review_queue, review_service
        from app.services.review_runner import run_review

        revision = await change_service.get_current_revision(session, change.id)
        job = await review_service.create_review_job(session, str(change.id), str(revision.id), str(user.id))
        mode = review_queue.enqueue_review(str(job.id))

        if mode == "inline":
            try:
                await run_review(session, job)
            except Exception as exc:
                # A failed review must not leave the change silently awaiting approval.
                await session.rollback()
                raise HTTPException(status_code=502, detail=f"AI review failed: {exc}") from exc
            change = await workflow_service.evaluate_review_outcome(session, change_id, job.id, str(user.id))

        return {
            **_brief(change),
            "review_job_id": str(job.id),
            "review_status": _enum(job.status),
            "review_mode": mode,
        }
    except TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{change_id}/cancel")
async def cancel_change(
    change_id: str,
    body: CancelRequest,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Cancel a change request."""
    try:
        change = await workflow_service.cancel_change(session, change_id, str(user.id), body.reason)
        return _brief(change)
    except TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{change_id}")
async def delete_change(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(require_role("ADMIN", "MANAGER")),
):
    """Soft-delete an RFC. Executed changes are refused, not removed."""
    try:
        change = await change_service.delete_change(session, change_id, str(user.id))
        return {**_brief(change), "deleted": True}
    except LookupError:
        raise HTTPException(status_code=404, detail="Change not found") from None
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e)) from None


@router.post("/bulk-delete")
async def bulk_delete_changes(
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(require_role("ADMIN", "MANAGER")),
):
    """Delete many RFCs. Partial success is reported per id, never silently skipped."""
    ids = body.get("change_ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=400, detail="change_ids must be a non-empty list")

    deleted, refused = [], []
    for change_id in ids:
        try:
            await change_service.delete_change(session, str(change_id), str(user.id))
            deleted.append(str(change_id))
        except Exception as e:
            number = None
            found = await change_service.get_change(session, str(change_id))
            if found:
                number = found.change_number
            refused.append({"id": str(change_id), "change_number": number, "reason": str(e) or "gagal dihapus"})
    return {"deleted": deleted, "refused": refused}


@router.post("/bulk-delete-all")
async def bulk_delete_all(
    session: AsyncSession = Depends(get_async_session),
    user=Depends(require_role("ADMIN", "MANAGER")),
):
    """Delete every deletable, non-deleted RFC at once."""
    listing = await change_service.list_changes(
        session, page=1, page_size=None
    )
    deleted, refused = [], []
    for item in listing["items"]:
        try:
            await change_service.delete_change(session, item["id"], str(user.id))
            deleted.append(item["id"])
        except Exception as e:
            refused.append({"id": item["id"], "change_number": item["change_number"], "reason": str(e) or "gagal dihapus"})
    return {"deleted": deleted, "refused": refused}


@router.post("/purge")
async def purge_deleted_changes(
    session: AsyncSession = Depends(get_async_session),
    user=Depends(require_role("ADMIN")),
):
    """Permanently remove soft-deleted RFCs (files included). Admin only."""
    result = await change_service.purge_deleted(session)
    return result


@router.post("/{change_id}/approve")
async def approve_change(
    change_id: str,
    body: ApproveRequest | None = None,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Advance to APPROVED once all mandatory approval tasks are approved."""
    if not has_any_role(user, "MANAGER", "CHANGE_MANAGER", "CAB_MEMBER", "FINAL_APPROVER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not authorized to approve changes")
    try:
        change = await workflow_service.approve_change(session, change_id, str(user.id))
        return _brief(change)
    except TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{change_id}/reject")
async def reject_change(
    change_id: str,
    body: DecisionRequest,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Reject a change (reason required)."""
    if not has_any_role(user, "MANAGER", "CHANGE_MANAGER", "CAB_MEMBER", "FINAL_APPROVER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not authorized to reject changes")
    try:
        change = await workflow_service.reject_change(session, change_id, str(user.id), body.reason)
        return _brief(change)
    except TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{change_id}/request-revision")
async def request_revision(
    change_id: str,
    body: DecisionRequest,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Send a change back to the requester and invalidate outstanding approvals."""
    if not has_any_role(user, "MANAGER", "CHANGE_MANAGER", "CAB_MEMBER", "FINAL_APPROVER", "ADMIN"):
        raise HTTPException(status_code=403, detail="Not authorized to request revision")
    try:
        change = await workflow_service.require_revision(session, change_id, str(user.id), body.reason)
        return _brief(change)
    except TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{change_id}/reopen")
async def reopen_change(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """REVISION_REQUIRED -> DRAFT so the requester can edit and resubmit."""
    try:
        change = await workflow_service.reopen_for_revision(session, change_id, str(user.id))
        return _brief(change)
    except TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{change_id}/history")
async def get_change_history(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Status timeline, revisions and audit events."""
    return await change_service.get_change_history(session, change_id)


@router.get("/{change_id}/execution-gate")
async def get_execution_gate(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Whether the change is execution-ready (markdown §8)."""
    change = await change_service.get_change(session, change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")
    errors = await workflow_service.execution_gate_errors(session, change)
    return {"ready": not errors, "blocking_reasons": errors}


@router.post("/{change_id}/schedule")
async def schedule_change(
    change_id: str,
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(require_role("CHANGE_MANAGER", "ADMIN")),
):
    """APPROVED -> SCHEDULED with an implementation window."""
    from datetime import datetime

    try:
        start = datetime.fromisoformat(str(body.get("start")))
        end = datetime.fromisoformat(str(body.get("end")))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="start and end must be ISO 8601 timestamps") from None
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(status_code=400, detail="start and end must include a timezone offset")
    try:
        change = await workflow_service.schedule_change(
            session, change_id, str(user.id), start=start, end=end, reason=body.get("reason")
        )
    except TransitionError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    return {
        **_brief(change),
        "implementation_start": change.implementation_start.isoformat(),
        "implementation_end": change.implementation_end.isoformat(),
    }
