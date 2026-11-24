from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ImplementationCreate(BaseModel):
    actual_start: Optional[datetime] = None
    execution_notes: Optional[str] = None
    precheck: dict = Field(default_factory=dict)


class ImplementationUpdate(BaseModel):
    actual_end: Optional[datetime] = None
    outcome: Optional[str] = None
    execution_notes: Optional[str] = None
    postcheck: Optional[dict] = None
    rollback_performed: Optional[bool] = None


class ImplementationResponse(BaseModel):
    id: str
    change_id: str
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    implementer_id: Optional[str] = None
    implementer_name: Optional[str] = None
    outcome: Optional[str] = None
    execution_notes: Optional[str] = None
    precheck: dict = Field(default_factory=dict)
    postcheck: dict = Field(default_factory=dict)
    rollback_performed: bool = False
    created_at: datetime


class PIRRequest(BaseModel):
    notes: str = Field(..., min_length=1)
    post_check_passed: bool = True
    service_validation: Optional[str] = None
