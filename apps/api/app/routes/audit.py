from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt_handler import get_current_active_user
from app.db.session import get_async_session
from app.services import audit_service

router = APIRouter(prefix="/audit-events", tags=["audit"])


@router.get("")
async def get_audit_events(
    object_type: str = None,
    object_id: str = None,
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_async_session),
    user=Depends(get_current_active_user),
):
    """Get audit events with optional filters."""
    events, total = await audit_service.get_audit_events(session, object_type, object_id, limit, offset)
    _labels = await audit_service.object_labels(session, events)

    return {
        "items": [
            {
                "id": str(e.id),
                "actor_user_id": str(e.actor_user_id) if e.actor_user_id else None,
                "actor_username": (_labels.get("actor") or {}).get(str(e.actor_user_id)),
                "actor_type": e.actor_type.value if hasattr(e.actor_type, "value") else str(e.actor_type),
                "action": e.action,
                "object_type": e.object_type,
                "object_id": str(e.object_id),
                "object_label": (_labels.get(e.object_type) or {}).get(str(e.object_id)),
                "event_data": e.event_data,
                "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None,
            }
            for e in events
        ],
        "total": total,
    }
