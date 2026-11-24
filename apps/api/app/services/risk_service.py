"""
Risk assessment service.

Deterministic scoring based on configurable factor weights.
Hard blockers override weighted score.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RiskAssessment, ChangeStatus


# Default formula version and weights
DEFAULT_WEIGHTS = {
    "configuration": 0.30,
    "service_impact": 0.25,
    "security": 0.20,
    "rollback": 0.15,
    "document_completeness": 0.10,
}


def calculate_risk_score(
    factors: dict,
    weights: dict | None = None,
    hard_blockers: list | None = None,
    formula_version: str = "v1",
) -> dict:
    """
    Calculate risk score from factor scores and weights.

    Args:
        factors: dict of factor_name -> score (0-100)
        weights: dict of factor_name -> weight (sums to 1.0)
        hard_blockers: list of blocker strings
        formula_version: version identifier for audit trail

    Returns:
        dict with score, risk_level, factors, hard_blockers
    """
    if weights is None:
        weights = DEFAULT_WEIGHTS

    hard_blockers = hard_blockers or []

    # Calculate weighted score
    total_weight = 0.0
    score = 0.0
    for factor, factor_score in factors.items():
        w = weights.get(factor, 0)
        score += factor_score * w
        total_weight += w

    if total_weight > 0:
        score = round(score / total_weight, 1)
    else:
        score = 0.0

    # Determine risk level
    if score < 30:
        risk_level = "LOW"
    elif score < 60:
        risk_level = "MEDIUM"
    elif score < 80:
        risk_level = "HIGH"
    else:
        risk_level = "CRITICAL"

    # Hard blockers override: if blockers exist, force HIGH at minimum
    if hard_blockers:
        if score < 60:
            score = 60.0
            risk_level = "HIGH"
    else:
        score = round(score, 1)

    return {
        "score": score,
        "risk_level": risk_level,
        "factors": factors,
        "hard_blockers": hard_blockers,
        "formula_version": formula_version,
    }


async def create_risk_assessment(
    session: AsyncSession,
    change_id: str,
    revision_id: str,
    factors: dict,
    weights: dict | None = None,
    hard_blockers: list | None = None,
) -> RiskAssessment:
    """Calculate and persist a risk assessment (does not commit)."""
    result = calculate_risk_score(factors, weights, hard_blockers)

    assessment = RiskAssessment(
        change_id=change_id,
        revision_id=revision_id,
        formula_version=result["formula_version"],
        score=result["score"],
        risk_level=result["risk_level"],
        factors=result["factors"],
        hard_blockers=result["hard_blockers"],
    )
    session.add(assessment)
    await session.flush()
    return assessment


async def get_latest_risk_assessment(session: AsyncSession, change_id: str) -> RiskAssessment | None:
    result = await session.execute(
        select(RiskAssessment)
        .where(RiskAssessment.change_id == change_id)
        .order_by(RiskAssessment.calculated_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


def is_review_blocked(hard_blockers: list) -> bool:
    """Check if hard blockers prevent normal approval."""
    return len(hard_blockers) > 0
