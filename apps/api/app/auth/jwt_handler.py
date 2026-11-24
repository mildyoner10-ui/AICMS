"""Back-compat re-export. Prefer app.auth.deps."""

from app.auth.deps import (  # noqa: F401
    get_current_active_user,
    get_current_user,
    has_any_role,
    has_role,
    require_role,
)
