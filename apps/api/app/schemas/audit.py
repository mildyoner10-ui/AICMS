from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AuditEventResponse(BaseModel):
    id: str
    actor_user_id: Optional[str] = None
    actor_user_name: Optional[str] = None
    actor_type: str
    action: str
    object_type: str
    object_id: str
    correlation_id: Optional[str] = None
    event_data: dict = Field(default_factory=dict)
    occurred_at: datetime
