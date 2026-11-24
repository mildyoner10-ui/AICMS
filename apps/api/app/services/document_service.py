from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Change, Document, ChangeStatus, AuditEvent, AuditActorType, DocumentScanStatus, DocumentExtractionStatus, DocumentType


ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".xlsx", ".txt", ".cfg", ".yaml", ".yml", ".json",
    ".png", ".jpg", ".jpeg",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
    "text/yaml",
    "text/x-yaml",
    "application/yaml",
    "application/json",
    "text/calendar",
    "image/png",
    "image/jpeg",
}


async def upload_document(
    session: AsyncSession,
    change_id: str,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    uploaded_by_id: str,
    document_type: str = None,
) -> Document:
    """Validate, store metadata, and create document record."""
    import hashlib
    import uuid
    from app.integrations.storage.storage import get_storage

    # Validate extension
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"File extension not allowed: {ext}")

    # Validate MIME type
    if mime_type and mime_type not in ALLOWED_MIME_TYPES:
        raise ValueError(f"MIME type not allowed: {mime_type}")

    # Validate size
    if len(file_bytes) > MAX_FILE_SIZE:
        raise ValueError(f"File too large: {len(file_bytes)} bytes (max {MAX_FILE_SIZE})")

    # Calculate SHA-256
    sha256 = hashlib.sha256(file_bytes).hexdigest()

    # Get change
    result = await session.execute(select(Change).where(Change.id == change_id))
    change = result.scalar_one_or_none()
    if not change:
        raise ValueError("Change not found")

    if change.status not in (ChangeStatus.DRAFT, ChangeStatus.SUBMITTED, ChangeStatus.DOCUMENT_VALIDATION, ChangeStatus.AI_REVIEW, ChangeStatus.REVISION_REQUIRED):
        raise ValueError(f"Cannot upload document to change in status: {change.status.value}")

    # Get version number
    version_result = await session.execute(
        select(Document)
        .where(Document.change_id == change_id, Document.original_filename == filename)
        .order_by(Document.version_number.desc())
        .limit(1)
    )
    existing = version_result.scalar_one_or_none()
    version_number = (existing.version_number + 1) if existing else 1

    # Immutable object key: never overwrite prior bytes
    object_key = f"{change_id}/{uuid.uuid4().hex}/{filename}"
    get_storage().put(object_key, file_bytes)
    document = Document(
        change_id=change_id,
        original_filename=filename,
        object_key=object_key,
        mime_type=mime_type or None,
        size_bytes=len(file_bytes),
        sha256=sha256,
        document_type=DocumentType(document_type) if document_type else None,
        version_number=version_number,
        scan_status=DocumentScanStatus.PENDING,
        extraction_status=DocumentExtractionStatus.PENDING,
        uploaded_by_id=uploaded_by_id,
    )
    session.add(document)
    await session.flush()  # populate document.id for the audit FK

    # Audit
    audit = AuditEvent(
        actor_user_id=uploaded_by_id,
        actor_type=AuditActorType.USER.value,
        action="document.uploaded",
        object_type="DOCUMENT",
        object_id=document.id,
        event_data={
            "filename": filename,
            "version": version_number,
            "size": len(file_bytes),
            "sha256": sha256,
        },
    )
    session.add(audit)

    await session.commit()
    await session.refresh(document)
    return document


async def list_documents(session: AsyncSession, change_id: str) -> list[Document]:
    result = await session.execute(
        select(Document)
        .options(selectinload(Document.uploader))
        .where(Document.change_id == change_id)
        .order_by(Document.version_number.desc())
    )
    return result.scalars().all()


async def get_document(session: AsyncSession, document_id: str) -> Document | None:
    result = await session.execute(select(Document).where(Document.id == document_id))
    return result.scalar_one_or_none()


def read_bytes(document: Document) -> bytes:
    """Raw stored bytes, for preview/download. MIME and filename come from the DB."""
    from app.integrations.storage.storage import get_storage

    return get_storage().get(document.object_key)


async def download_document_metadata(session: AsyncSession, document_id: str, user_id: str) -> Document:
    """Return document metadata for authorized users."""
    from app.models import Change

    result = await session.execute(
        select(Document).where(Document.id == document_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise ValueError("Document not found")

    # Check authorization - user must have access to the change
    change_result = await session.execute(select(Change).where(Change.id == doc.change_id))
    change = change_result.scalar_one_or_none()
    if not change:
        raise ValueError("Associated change not found")

    # For MVP, allow if user is requester, uploader, or has any role
    # TODO: Implement proper object-level authorization
    return doc


async def reprocess_document(session: AsyncSession, document_id: str, user_id: str) -> Document:
    """Reprocess a document (retry scan/extraction). Admin only."""
    result = await session.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise ValueError("Document not found")

    doc.scan_status = DocumentScanStatus.PENDING
    doc.extraction_status = DocumentExtractionStatus.PENDING

    # Audit
    audit = AuditEvent(
        actor_user_id=user_id,
        actor_type=AuditActorType.USER.value,
        action="document.reprocessed",
        object_type="DOCUMENT",
        object_id=document_id,
    )
    session.add(audit)

    await session.commit()
    await session.refresh(doc)
    return doc
