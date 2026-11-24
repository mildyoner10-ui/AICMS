from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ReviewCreate(BaseModel):
    pass


class ReviewJobResponse(BaseModel):
    id: str
    change_id: str
    revision_id: str
    status: str
    provider: Optional[str] = None
    model_name: Optional[str] = None
    prompt_version: Optional[str] = None
    ruleset_version: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_by_id: str
    created_at: datetime


class ReviewResultResponse(BaseModel):
    id: str
    review_job_id: str
    recommendation: Optional[str] = None
    overall_risk_score: Optional[float] = None
    summary: Optional[str] = None
    limitations: list[str] = Field(default_factory=list)
    formula_version: Optional[str] = None
    findings: list["FindingResponse"] = Field(default_factory=list)


class FindingResponse(BaseModel):
    id: str
    check_category: str
    check_name: Optional[str] = None
    status: str
    severity: str
    title: str
    description: Optional[str] = None
    evidence: list[dict] = Field(default_factory=list)
    remediation: Optional[str] = None
    confidence: Optional[float] = None
    human_validation_required: bool = False
    created_at: datetime
