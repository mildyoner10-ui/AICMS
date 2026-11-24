from datetime import datetime

from pydantic import BaseModel, Field


class PaginatedResponse(BaseModel):
    total: int = Field(..., description="Total records matching filters")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Records per page")


class BaseModel(BaseModel):
    model_config = {"from_attributes": True}


class APIError(BaseModel):
    error: dict
