from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.services import document_service

router = APIRouter(prefix="/changes/{change_id}/documents", tags=["documents"])


@router.post("", response_model=dict, status_code=201)
async def upload_document(
    change_id: str,
    file: UploadFile = File(...),
    document_type: str = Query(None),
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Upload a document to a change request."""
    try:
        file_bytes = await file.read()
        doc = await document_service.upload_document(
            session=session,
            change_id=change_id,
            file_bytes=file_bytes,
            filename=file.filename or "unknown",
            mime_type=file.content_type,
            uploaded_by_id=str(user.id),
            document_type=document_type,
        )
        return {
            "document_id": str(doc.id),
            "original_filename": doc.original_filename,
            "sha256": doc.sha256,
            "version_number": doc.version_number,
            "size_bytes": doc.size_bytes,
            "scan_status": doc.scan_status.value if hasattr(doc.scan_status, "value") else str(doc.scan_status),
            "extraction_status": doc.extraction_status.value if hasattr(doc.extraction_status, "value") else str(doc.extraction_status),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{document_id}/download")
async def download_document(
    change_id: str,
    document_id: str,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Stored bytes of one document, as originally uploaded."""
    import io

    doc = await document_service.get_document(session, document_id)
    if not doc or str(doc.change_id) != change_id:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        raw = document_service.read_bytes(doc)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Stored file missing")
    return StreamingResponse(
        io.BytesIO(raw),
        media_type=doc.mime_type or "application/octet-stream",
        headers={
            # inline: the browser previews PDF/images instead of forcing a save
            "Content-Disposition": f'inline; filename="{doc.original_filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("", response_model=dict)
async def list_documents(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """List documents for a change."""
    docs = await document_service.list_documents(session, change_id)
    return {
        "items": [
            {
                "id": str(d.id),
                "original_filename": d.original_filename,
                "document_type": d.document_type.value if hasattr(d.document_type, "value") else str(d.document_type),
                "version_number": d.version_number,
                "sha256": d.sha256,
                "size_bytes": d.size_bytes,
                "scan_status": d.scan_status.value if hasattr(d.scan_status, "value") else str(d.scan_status),
                "extraction_status": d.extraction_status.value if hasattr(d.extraction_status, "value") else str(d.extraction_status),
                "uploaded_at": d.uploaded_at.isoformat() if d.uploaded_at else None,
            }
            for d in docs
        ]
    }
