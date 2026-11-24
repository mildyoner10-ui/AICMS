from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.services import audit_service

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def get_summary(session: AsyncSession = Depends(get_async_session)):
    """Get dashboard summary data."""
    return await audit_service.get_dashboard_summary(session)


@router.get("/risk-distribution")
async def get_risk_distribution(session: AsyncSession = Depends(get_async_session)):
    """Get risk score distribution."""
    return await audit_service.get_risk_distribution(session)


@router.get("/approval-aging")
async def get_approval_aging(session: AsyncSession = Depends(get_async_session)):
    """Get approval task aging data."""
    return await audit_service.get_approval_aging(session)
