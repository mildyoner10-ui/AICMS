"""Review pipeline runner: resolve revision documents -> extract -> screen -> provider -> risk -> persist."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.integrations.ai.review_provider import (
    PROMPT_VERSION,
    RULESET_VERSION,
    ReviewRequest,
    get_review_provider,
    validate_review_output,
)
from app.integrations.storage.storage import get_storage
from app.models import Change, ChangeRevision, Document, DocumentExtractionStatus, ReviewStatus
from app.services import document_extract, review_service, risk_service

# Documents beyond this count are reported, not silently skipped.
MAX_DOCUMENTS = 20


async def _load_document_evidence(session: AsyncSession, change_id, revision_id) -> list[dict]:
    """Documents of the reviewed revision with redacted text; marks extraction status."""
    query = select(Document).where(Document.change_id == change_id)
    # A revision snapshot only includes documents that existed when it was locked.
    if revision_id is not None:
        query = query.where((Document.revision_id == revision_id) | (Document.revision_id.is_(None)))
    docs = (await session.execute(query.order_by(Document.uploaded_at))).scalars().all()

    storage = get_storage()
    evidence = []
    for doc in docs[:MAX_DOCUMENTS]:
        item = {"id": str(doc.id), "original_filename": doc.original_filename, "mime_type": doc.mime_type, "sha256": doc.sha256}
        try:
            raw = storage.get(doc.object_key)
            summary = document_extract.summarize(doc.original_filename, document_extract.extract_text(doc.original_filename, raw))
            item.update(summary)
            doc.extraction_status = DocumentExtractionStatus.COMPLETED
        except document_extract.ExtractionError as exc:
            item.update({"text": "", "injection_candidates": [], "truncated": False, "extraction_error": str(exc)})
            doc.extraction_status = DocumentExtractionStatus.FAILED
        except Exception as exc:  # storage/parse failure must not lose the whole review
            item.update({"text": "", "injection_candidates": [], "truncated": False, "extraction_error": str(exc)})
            doc.extraction_status = DocumentExtractionStatus.ERROR
        evidence.append(item)
    return evidence


async def run_review(session: AsyncSession, job) -> None:
    job.status = ReviewStatus.RUNNING
    try:
        change = (
            await session.execute(select(Change).where(Change.id == job.change_id))
        ).scalar_one()
        revision = (
            await session.execute(select(ChangeRevision).where(ChangeRevision.id == job.revision_id))
        ).scalar_one_or_none()

        documents = await _load_document_evidence(session, change.id, job.revision_id)

        def val(x):
            return x.value if hasattr(x, "value") else str(x)

        # The revision snapshot is what was submitted; fall back to the live row for old data.
        snapshot = (revision.snapshot if revision and revision.snapshot else {}) or {}
        change_data = {
            "title": snapshot.get("title") or change.title,
            "description": snapshot.get("description") or change.description,
            "category": val(change.category),
            "change_type": val(change.change_type),
            "business_justification": snapshot.get("business_justification") or change.business_justification,
            "impact_description": snapshot.get("impact_description") or change.impact_description,
            "implementation_plan": snapshot.get("implementation_plan") or change.implementation_plan,
            "test_plan": snapshot.get("test_plan") or change.test_plan,
            "rollback_plan": snapshot.get("rollback_plan") or change.rollback_plan,
            "affected_devices": snapshot.get("affected_devices") or change.affected_devices,
            "environment": val(change.environment),
        }

        provider = get_review_provider()
        result = await provider.analyze(
            ReviewRequest(
                revision_id=str(job.revision_id),
                change_id=str(change.id),
                documents=documents,
                change_data=change_data,
            )
        )
        validated = validate_review_output(result.data)

        hard_blockers = [
            f"{f.get('title', '')} [{f.get('check_name', '')}]"
            for f in validated.get("findings", [])
            if f.get("severity") in ("CRITICAL", "HIGH") and f.get("status") == "FAIL"
        ]
        risk = risk_service.calculate_risk_score(validated.get("factor_scores", {}), hard_blockers=hard_blockers)
        validated["overall_risk_score"] = risk["score"]
        validated["risk_level"] = risk["risk_level"]
        validated["hard_blockers"] = hard_blockers
        validated["prompt_version"] = PROMPT_VERSION
        validated["ruleset_version"] = RULESET_VERSION
        validated["document_hashes"] = [
            {"id": d["id"], "sha256": d["sha256"], "filename": d["original_filename"]} for d in documents
        ]

        await risk_service.create_risk_assessment(
            session,
            str(change.id),
            str(job.revision_id),
            validated.get("factor_scores", {}),
            hard_blockers=hard_blockers,
        )
        await review_service.complete_review_job(
            session,
            job,
            provider=provider.provider_name,
            model_name=result.data.get("provider_label") or provider.provider_name,
            result_data=validated,
        )
    except Exception as exc:
        await session.rollback()
        await review_service.fail_review_job(session, job, "REVIEW_ERROR", f"{type(exc).__name__}: {exc}")
        raise
