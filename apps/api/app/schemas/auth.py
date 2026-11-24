from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=1, max_length=200)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class TokenData(BaseModel):
    user_id: Optional[str] = None
    username: Optional[str] = None
    roles: list[str] = Field(default_factory=list)


class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    display_name: Optional[str] = None
    is_active: bool
    auth_provider: str
    role_codes: list[str] = Field(default_factory=list)
    created_at: datetime

    model_config = {"from_attributes": True}


class RoleResponse(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str] = None

    model_config = {"from_attributes": True}


class UserRoleResponse(BaseModel):
    id: str
    user_id: str
    role_id: str
    scope_type: Optional[str] = None
    scope_id: Optional[str] = None
    role: Optional[RoleResponse] = None

    model_config = {"from_attributes": True}
