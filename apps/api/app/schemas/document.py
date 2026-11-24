from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DocumentUploadResponse(BaseModel):
    document_id: str
    original_filename: str
    object_key: str
    mime_type: Optional[str] = None
    size_bytes: int
    sha256: str
    version_number: int
    scan_status: str
    extraction_status: str


class DocumentResponse(BaseModel):
    id: str
    change_id: str
    revision_id: Optional[str] = None
    original_filename: str
    object_key: str
    mime_type: Optional[str] = None
    size_bytes: int
    sha256: str
    document_type: Optional[str] = None
    version_number: int
    scan_status: str
    extraction_status: str
    uploaded_by_id: str
    uploaded_by_name: Optional[str] = None
    uploaded_at: datetime


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]


class DocumentReprocessRequest(BaseModel):
    reason: Optional[str] = None
