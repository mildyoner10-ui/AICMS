"""Default approval routing (markdown/06_WORKFLOW_AND_APPROVAL.md §3).

The matrix is a template, not policy: it maps a change's type and assessed risk
level to an ordered list of approval steps. Each step is a role code. Steps run
sequentially — one unlocked step at a time, in `step_order`.
"""

from typing import Optional

# Ordered role codes per route. Sequential: each step must approve before the next unlocks.
TECH = "TECH_REVIEWER"
MANAGER = "MANAGER"
CHANGE_MANAGER = "CHANGE_MANAGER"
CAB = "CAB_MEMBER"
FINAL = "FINAL_APPROVER"

DEFAULT_MATRIX: dict[str, list[str]] = {
    "LOW": [TECH, MANAGER],
    "MEDIUM": [TECH, MANAGER, CHANGE_MANAGER],
    "HIGH": [TECH, MANAGER, CHANGE_MANAGER, CAB, FINAL],
    "CRITICAL": [TECH, MANAGER, CHANGE_MANAGER, CAB, FINAL],
}

EMERGENCY_ROUTE: list[str] = [CHANGE_MANAGER, MANAGER]


def route_for(change_type: str, risk_level: Optional[str], matrix: Optional[dict[str, list[str]]] = None) -> list[str]:
    """Ordered role codes that must approve this change."""
    if change_type == "EMERGENCY":
        return list(EMERGENCY_ROUTE)
    effective = matrix or DEFAULT_MATRIX
    # An unassessed change is never routed as low risk.
    level = (risk_level or "MEDIUM").upper()
    return list(effective.get(level, effective["MEDIUM"]))
