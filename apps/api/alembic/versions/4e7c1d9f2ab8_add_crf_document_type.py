"""add CRF to documenttype

Revision ID: 4e7c1d9f2ab8
Revises: 2b2ca81ab3ff
Create Date: 2026-11-20 15:30:00.000000
"""
from alembic import op

revision = '4e7c1d9f2ab8'
down_revision = '2b2ca81ab3ff'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS: the seed path re-runs migrations on an existing dev volume.
    op.execute("ALTER TYPE documenttype ADD VALUE IF NOT EXISTS 'CRF' AFTER 'MOP'")


def downgrade() -> None:
    # Postgres cannot drop an enum value; deleting the rows is the only safe reversal.
    op.execute("UPDATE documents SET document_type = NULL WHERE document_type = 'CRF'")
