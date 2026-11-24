from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_active_user, has_any_role
from app.db.session import get_async_session
from app.services import review_service, change_service, workflow_service

router = APIRouter(prefix="/changes/{change_id}/reviews", tags=["reviews"])


def review_error_text(raw: str | None) -> str:
    """Provider failures become a message a requester can act on; raw text stays in the DB."""
    if not raw:
        return "Tinjauan AI gagal diproses. Silakan coba lagi."
    if "503" in raw or "502" in raw or "Service Unavailable" in raw or "Bad Gateway" in raw:
        return "Layanan AI sedang tidak tersedia. Coba jalankan ulang beberapa saat lagi atau hubungi administrator."
    if "429" in raw or "rate limit" in raw.lower():
        return "Layanan AI sedang sibuk (batas permintaan). Coba lagi nanti."
    if "timeout" in raw.lower() or "timed out" in raw.lower():
        return "Tinjauan AI melewati batas waktu. Coba jalankan ulang."
    if "401" in raw or "403" in raw or "api key" in raw.lower():
        return "Konfigurasi kredensial AI ditolak. Hubungi administrator."
    if "ValidationError" in raw or "valid JSON" in raw:
        return "Respons AI tidak dapat dibaca sistem. Coba jalankan ulang."
    return "Tinjauan AI gagal diproses. Coba jalankan ulang atau hubungi administrator."


@router.post("", response_model=dict, status_code=201)
async def create_review(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Enqueue an AI review for the current revision."""
    from sqlalchemy import select
    from app.models import ChangeRevision
    from app.services import review_queue
    from app.services.review_runner import run_review

    change = await change_service.get_change(session, change_id)
    if not change:
        raise HTTPException(status_code=404, detail="Change not found")

    # Park the change in AI_REVIEW so the worker can evaluate the outcome when the
    # job finishes (evaluate_review_outcome requires that status). Already there
    # means a retry after a failed review, which is allowed.
    if change.status.value != "AI_REVIEW":
        try:
            await workflow_service.advance_ai_review(session, change_id, str(user.id))
        except workflow_service.TransitionError as e:
            raise HTTPException(status_code=400, detail=str(e))

    rev_result = await session.execute(
        select(ChangeRevision)
        .where(ChangeRevision.change_id == change_id, ChangeRevision.is_current == True)
        .order_by(ChangeRevision.revision_number.desc())
        .limit(1)
    )
    revision = rev_result.scalar_one_or_none()
    if not revision:
        raise HTTPException(status_code=400, detail="No revision found")

    job = await review_service.create_review_job(session, change_id, str(revision.id), str(user.id))
    mode = review_queue.enqueue_review(str(job.id))

    if mode == "inline":
        try:
            await run_review(session, job)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Review processing failed: {e}")
        # The RQ entrypoint evaluates the outcome; inline mode needs the same step
        # or the change stays parked in AI_REVIEW.
        await session.refresh(job)
        try:
            await workflow_service.evaluate_review_outcome(session, change_id, job.id, str(user.id))
        except workflow_service.TransitionError:
            pass

    return {
        "id": str(job.id),
        "status": job.status.value,
        "review_mode": mode,
    }


@router.get("", response_model=dict)
async def list_reviews(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """List all reviews for a change."""
    jobs = await review_service.get_reviews_for_change(session, change_id)
    return {
        "items": [
            {
                "id": str(j.id),
                "status": j.status.value if hasattr(j.status, "value") else str(j.status),
                "provider": j.provider,
                "created_at": j.started_at.isoformat() if j.started_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in jobs
        ]
    }


@router.get("/{review_id}", response_model=dict)
async def get_review(
    change_id: str,
    review_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Review job status and result."""
    job = await review_service.get_review_job(session, review_id)
    if not job:
        raise HTTPException(status_code=404, detail="Review not found")

    result = {
        "id": str(job.id),
        "change_id": str(job.change_id),
        "revision_id": str(job.revision_id),
        "status": job.status.value if hasattr(job.status, "value") else str(job.status),
        "provider": job.provider,
        "model_name": job.model_name,
        "prompt_version": job.prompt_version,
        "ruleset_version": job.ruleset_version,
        "started_at": job.started_at.isoformat() if job.started_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
        "review_error": review_error_text(job.error_message) if job.status.value == "FAILED" else None,
    }

    if job.result:
        result["result"] = {
            "recommendation": job.result.recommendation,
            "overall_risk_score": job.result.overall_risk_score,
            "summary": job.result.summary,
            "limitations": job.result.limitations,
            "result_json": job.result.result_json,
            "decision": job.result.decision.value if job.result.decision else None,
            "decision_comment": job.result.decision_comment,
            "decided_at": job.result.decided_at.isoformat() if job.result.decided_at else None,
            "decided_by": job.result.decided_by.username if job.result.decided_by else None,
            "findings": [
                {
                    "id": str(f.id),
                    "check_category": f.check_category,
                    "check_name": f.check_name,
                    "status": f.status.value if hasattr(f.status, "value") else str(f.status),
                    "severity": f.severity.value if hasattr(f.severity, "value") else str(f.severity),
                    "title": f.title,
                    "description": f.description,
                    "evidence": f.evidence,
                    "remediation": f.remediation,
                    "confidence": f.confidence,
                    "human_validation_required": f.human_validation_required,
                }
                for f in job.result.findings
            ],
        }

    return result


@router.post("/{review_id}/decision", response_model=dict)
async def decide_review(
    change_id: str,
    review_id: str,
    body: dict,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Reviewer verification: accept the AI result or return the RFC for revision.

    The reviewer decides the change's next step; the AI output itself is never
    rewritten. Open HIGH/CRITICAL findings cannot be overridden.
    """
    if not has_any_role(user, *workflow_service.REVIEWER_ROLES):
        raise HTTPException(status_code=403, detail="Hanya reviewer yang dapat memutuskan hasil tinjauan AI")
    try:
        change = await workflow_service.decide_review(
            session,
            change_id,
            decision=str(body.get("decision") or ""),
            user_id=str(user.id),
            review_id=review_id,
            comment=body.get("comment"),
        )
    except workflow_service.TransitionError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"status": "ok", "change_status": change.status.value}
