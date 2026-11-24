from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field

from app.schemas.base import PaginatedResponse


class ChangeCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    category: str = Field(..., description="ChangeCategory enum value")
    change_type: str = Field("NORMAL", description="ChangeType enum value")
    business_justification: Optional[str] = None
    affected_services: list[str] = Field(default_factory=list)
    affected_devices: list[str] = Field(default_factory=list)
    environment: str = Field("TEST", description="Environment enum value")
    implementation_start: Optional[datetime] = None
    implementation_end: Optional[datetime] = None
    impact_description: Optional[str] = None
    implementation_plan: Optional[str] = None
    test_plan: Optional[str] = None
    rollback_plan: Optional[str] = None
    communication_plan: Optional[str] = None
    emergency_justification: Optional[str] = None
    emergency_incident_ref: Optional[str] = None


class ChangeUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    change_type: Optional[str] = None
    business_justification: Optional[str] = None
    affected_services: Optional[list[str]] = None
    affected_devices: Optional[list[str]] = None
    environment: Optional[str] = None
    implementation_start: Optional[datetime] = None
    implementation_end: Optional[datetime] = None
    impact_description: Optional[str] = None
    implementation_plan: Optional[str] = None
    test_plan: Optional[str] = None
    rollback_plan: Optional[str] = None
    communication_plan: Optional[str] = None


class ChangeResponse(BaseModel):
    id: str
    change_number: str
    title: str
    description: Optional[str] = None
    category: str
    change_type: str
    business_justification: Optional[str] = None
    affected_services: list[str] = Field(default_factory=list)
    affected_devices: list[str] = Field(default_factory=list)
    environment: str
    implementation_start: Optional[datetime] = None
    implementation_end: Optional[datetime] = None
    impact_description: Optional[str] = None
    implementation_plan: Optional[str] = None
    test_plan: Optional[str] = None
    rollback_plan: Optional[str] = None
    communication_plan: Optional[str] = None
    requester_id: str
    requester_name: Optional[str] = None
    status: str
    risk_level: Optional[str] = None
    current_revision_number: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None


class ChangeListResponse(PaginatedResponse):
    items: list[ChangeResponse]


class ChangeRevisionCreate(BaseModel):
    content_hash: Optional[str] = None


class ChangeRevisionResponse(BaseModel):
    id: str
    change_id: str
    revision_number: int
    snapshot: dict = Field(default_factory=dict)
    content_hash: Optional[str] = None
    is_current: bool
    created_by_id: str
    created_at: datetime


class ChangeHistoryResponse(BaseModel):
    id: str
    change_number: str
    status: str
    revision_number: int
    change_type: str
    category: str
    environment: str
    requester_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SubmitRequest(BaseModel):
    reason: Optional[str] = None


class DecisionRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class ApproveRequest(BaseModel):
    comment: Optional[str] = None


class CancelRequest(BaseModel):
    reason: str = Field(..., min_length=1)
