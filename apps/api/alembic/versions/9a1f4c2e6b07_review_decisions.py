"""human decision on an AI review

Revision ID: 9a1f4c2e6b07
Revises: 7c31b8a90d42
Create Date: 2026-11-23 15:30:00.000000

A reviewer with the REVIEWER role records whether the AI findings are acceptable.
The AI result itself is never altered: the decision is stored beside it.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = '9a1f4c2e6b07'
down_revision = '7c31b8a90d42'
branch_labels = None
depends_on = None

review_decision = postgresql.ENUM("ACCEPT", "RETURN_FOR_REVISION", name="reviewdecision", create_type=False)


def upgrade() -> None:
    review_decision.create(op.get_bind(), checkfirst=True)
    op.add_column("review_results", sa.Column("decision", review_decision, nullable=True))
    op.add_column("review_results", sa.Column("decision_comment", sa.Text(), nullable=True))
    op.add_column("review_results", sa.Column("decided_by_id", sa.UUID(as_uuid=True), nullable=True))
    op.add_column("review_results", sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_review_results_decided_by_id", "review_results", "users", ["decided_by_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_review_results_decided_by_id", "review_results", type_="foreignkey")
    op.drop_column("review_results", "decided_at")
    op.drop_column("review_results", "decided_by_id")
    op.drop_column("review_results", "decision_comment")
    op.drop_column("review_results", "decision")
    review_decision.drop(op.get_bind(), checkfirst=True)