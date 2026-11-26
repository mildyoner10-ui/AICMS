"""repair changecategory enum type name on databases migrated by the earlier
a1b2c3d4e5f6 revision, which left the enum named ``changecategory_v2``.
SQLAlchemy derives the type name from ``ChangeCategory`` → ``changecategory``,
so INSERT/UPDATE failed with ``type "changecategory" does not exist``.

Idempotent: on fresh databases (already fixed) it is a no-op.

Revision ID: e5f6a7b8c9d0
Revises: a1b2c3d4e5f6
"""
from alembic import op

revision = "e5f6a7b8c9d0"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Only act if the stale v2 type exists. Rename it to the canonical name so
    # the model and the database agree again.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'changecategory_v2')
               AND NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'changecategory') THEN
                ALTER TYPE changecategory_v2 RENAME TO changecategory;
            END IF;
        END $$;
        """
    )

    # If both somehow exist, the column may still point to v2. Normalize it.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'changecategory_v2') THEN
                IF (SELECT udt_name FROM information_schema.columns
                    WHERE table_name = 'changes' AND column_name = 'category') = 'changecategory_v2' THEN
                    ALTER TABLE changes ALTER COLUMN category TYPE changecategory
                        USING category::text::changecategory;
                END IF;
                DROP TYPE changecategory_v2;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    # Not reversible: the canonical name is required by the model.
    pass
