from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class RiskAssessmentResponse(BaseModel):
    id: str
    change_id: str
    revision_id: Optional[str] = None
    formula_version: str
    score: float
    risk_level: str
    factors: dict
    hard_blockers: list
    calculated_at: datetime

    model_config = {"from_attributes": True}
