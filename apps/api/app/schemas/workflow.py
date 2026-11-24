from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ApprovalDecisionRequest(BaseModel):
    decision: str = Field(..., description="'APPROVE', 'REJECT', or 'REQUEST_REVISION'")
    comment: Optional[str] = None

    def model_post_init(self, __context):
        if self.decision in ("REJECT", "REQUEST_REVISION") and not self.comment:
            raise ValueError("Comment required for REJECT and REQUEST_REVISION decisions")


class ApprovalTaskResponse(BaseModel):
    id: str
    workflow_instance_id: str
    step_code: str
    step_order: int
    assigned_role_id: Optional[str] = None
    assigned_user_id: Optional[str] = None
    assigned_user_name: Optional[str] = None
    assigned_role_name: Optional[str] = None
    status: str
    due_at: Optional[datetime] = None
    decision: Optional[str] = None
    comment: Optional[str] = None
    decided_at: Optional[datetime] = None
    created_at: datetime


class ApprovalTaskDetailResponse(ApprovalTaskResponse):
    change_id: str
    change_number: str
    change_title: str
    change_status: str
    change_risk_score: Optional[float] = None
    workflow_steps: list["ApprovalTaskResponse"] = Field(default_factory=list)


class ApprovalInboxResponse(BaseModel):
    pending_count: int
    tasks: list[ApprovalTaskResponse]


class WorkflowInstanceResponse(BaseModel):
    id: str
    change_id: str
    revision_id: Optional[str] = None
    status: str
    current_step: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    tasks: list[ApprovalTaskResponse] = Field(default_factory=list)
