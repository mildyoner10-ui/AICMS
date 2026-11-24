from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DashboardSummary(BaseModel):
    total_changes: int = 0
    by_status: dict[str, int] = Field(default_factory=dict)
    by_category: dict[str, int] = Field(default_factory=dict)
    by_type: dict[str, int] = Field(default_factory=dict)
    pending_approvals: int = 0
    ai_review_pending: int = 0
    ai_review_flagged: int = 0
    upcoming_changes: int = 0
    completed: int = 0
    failed: int = 0
    rolled_back: int = 0


class RiskDistribution(BaseModel):
    low: int = 0
    medium: int = 0
    high: int = 0
    critical: int = 0


class ApprovalAgingResponse(BaseModel):
    under_24h: int = 0
    under_48h: int = 0
    over_48h: int = 0
