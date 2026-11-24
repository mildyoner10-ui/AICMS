from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.services import review_service, audit_service
from app.models import ReviewStatus

router = APIRouter(prefix="/changes/{change_id}/reviews", tags=["reviews"])


@router.get("", response_model=dict)
async def list_reviews(
    change_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """List all reviews for a change."""
    jobs = await review_service.get_reviews_for_change(session, change_id)
    return {
        "items": [
            {
                "id": str(j.id),
                "status": j.status.value if hasattr(j.status, "value") else str(j.status),
                "provider": j.provider,
                "created_at": j.created_at.isoformat() if j.created_at else None,
                "completed_at": j.completed_at.isoformat() if j.completed_at else None,
            }
            for j in jobs
        ]
    }
