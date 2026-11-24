"""stage2 revisions transitions

Revision ID: 2b2ca81ab3ff
Revises: 2d814f082e2f
Create Date: 2026-11-20 03:05:14.692903
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '2b2ca81ab3ff'
down_revision = '2d814f082e2f'
branch_labels = None
depends_on = None

# changestatus already exists from the initial migration.
_change_status = postgresql.ENUM(
    'DRAFT', 'SUBMITTED', 'DOCUMENT_VALIDATION', 'AI_REVIEW', 'PENDING_APPROVAL',
    'APPROVED', 'SCHEDULED', 'IN_PROGRESS', 'VALIDATION', 'COMPLETED', 'CLOSED',
    'REVISION_REQUIRED', 'REJECTED', 'CANCELLED', 'FAILED', 'ROLLED_BACK',
    'REVIEW_FAILED', 'STALE',
    name='changestatus',
    create_type=False,
)


def upgrade() -> None:
    op.create_table(
        'change_status_transitions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('change_id', sa.UUID(), nullable=False),
        sa.Column('revision_id', sa.UUID(), nullable=True),
        sa.Column('from_status', _change_status, nullable=True),
        sa.Column('to_status', _change_status, nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('actor_user_id', sa.UUID(), nullable=True),
        sa.Column('actor_type', sa.String(length=20), nullable=False),
        sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['actor_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['change_id'], ['changes.id']),
        sa.ForeignKeyConstraint(['revision_id'], ['change_revisions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        op.f('ix_change_status_transitions_change_id'),
        'change_status_transitions',
        ['change_id'],
        unique=False,
    )

    op.add_column('approval_tasks', sa.Column('revision_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_approval_tasks_revision_id', 'approval_tasks', 'change_revisions', ['revision_id'], ['id']
    )
    op.add_column('change_revisions', sa.Column('locked_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('changes', sa.Column('approved_revision_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_changes_approved_revision_id', 'changes', 'change_revisions', ['approved_revision_id'], ['id']
    )


def downgrade() -> None:
    op.drop_constraint('fk_changes_approved_revision_id', 'changes', type_='foreignkey')
    op.drop_column('changes', 'approved_revision_id')
    op.drop_column('change_revisions', 'locked_at')
    op.drop_constraint('fk_approval_tasks_revision_id', 'approval_tasks', type_='foreignkey')
    op.drop_column('approval_tasks', 'revision_id')
    op.drop_index(op.f('ix_change_status_transitions_change_id'), table_name='change_status_transitions')
    op.drop_table('change_status_transitions')
