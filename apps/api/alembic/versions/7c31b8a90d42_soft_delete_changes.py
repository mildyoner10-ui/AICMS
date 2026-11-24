"""soft delete for change requests

Revision ID: 7c31b8a90d42
Revises: 4e7c1d9f2ab8
Create Date: 2026-11-23 10:00:00.000000

Deleting an RFC only hides it: audit trail and FK references stay valid.
"""
import sqlalchemy as sa
from alembic import op

revision = '7c31b8a90d42'
down_revision = '4e7c1d9f2ab8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "changes",
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "changes",
        sa.Column("deleted_by_id", sa.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_changes_deleted_by_id", "changes", "users", ["deleted_by_id"], ["id"]
    )
    op.create_index("ix_changes_deleted_at", "changes", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_changes_deleted_at", table_name="changes")
    op.drop_constraint("fk_changes_deleted_by_id", "changes", type_="foreignkey")
    op.drop_column("changes", "deleted_by_id")
    op.drop_column("changes", "deleted_at")
