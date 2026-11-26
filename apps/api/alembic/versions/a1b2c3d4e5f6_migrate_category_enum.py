"""migrate change_category enum: NETWORK/SERVER/... → HEAD_OFFICE/CHANNEL/BRANCH_OFFICE/OTHER

Revision ID: a1b2c3d4e5f6
Revises: 9a1f4c2e6b07
Create Date: 2026-11-23 09:00:00.000000

Old categories (NETWORK, SERVER, APPLICATION, DATABASE, SECURITY, INFRASTRUCTURE)
are all mapped to OTHER. The final enum KEEPS the name ``changecategory`` so it
matches the SQLAlchemy model (Enum(ChangeCategory)); renaming it to a different
type name breaks every INSERT with ``type "changecategory" does not exist``.
"""
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "9a1f4c2e6b07"
branch_labels = None
depends_on = None

# The canonical name MUST equal the SQLAlchemy model's derived type name.
TYPE_NAME = "changecategory"
TEMP_NAME = "changecategory_old"
NEW_VALUES = ("HEAD_OFFICE", "CHANNEL", "BRANCH_OFFICE", "OTHER")


def upgrade() -> None:
    # 1. Drop NOT NULL so values can be rewritten freely.
    op.execute("ALTER TABLE changes ALTER COLUMN category DROP NOT NULL")

    # 2. Cast to text: references to old/new enum literals are unsafe here
    #    because the target enum does not exist yet.
    op.execute(
        "UPDATE changes SET category = 'OTHER' "
        "WHERE category::text NOT IN ('HEAD_OFFICE', 'CHANNEL', 'BRANCH_OFFICE', 'OTHER')"
    )

    # 3. Free the canonical type name, create the new enum under that SAME name.
    op.execute(f"ALTER TYPE {TYPE_NAME} RENAME TO {TEMP_NAME}")
    op.execute(
        f"CREATE TYPE {TYPE_NAME} AS ENUM " + "(" + ", ".join(f"'{v}'" for v in NEW_VALUES) + ")"
    )

    # 4. Convert column, remove obsolete type, restore NOT NULL.
    op.execute(
        f"ALTER TABLE changes ALTER COLUMN category TYPE {TYPE_NAME} "
        f"USING category::text::{TYPE_NAME}"
    )
    op.execute(f"DROP TYPE {TEMP_NAME}")
    op.execute("ALTER TABLE changes ALTER COLUMN category SET NOT NULL")


def downgrade() -> None:
    op.execute("ALTER TABLE changes ALTER COLUMN category DROP NOT NULL")

    # Convert to text FIRST so new enum values (HEAD_OFFICE, ...) are not
    # compared against literals that only exist in the old enum.
    op.execute("ALTER TABLE changes ALTER COLUMN category TYPE text USING category::text")
    op.execute(
        "UPDATE changes SET category = 'NETWORK' "
        "WHERE category NOT IN ('NETWORK', 'SERVER', 'APPLICATION', 'DATABASE', 'SECURITY', 'INFRASTRUCTURE', 'OTHER')"
    )

    # Recreate the old enum under the canonical name and convert back.
    op.execute(f"ALTER TYPE {TYPE_NAME} RENAME TO {TEMP_NAME}")
    op.execute(
        f"CREATE TYPE {TYPE_NAME} AS ENUM "
        "('NETWORK', 'SERVER', 'APPLICATION', 'DATABASE', 'SECURITY', 'INFRASTRUCTURE', 'OTHER')"
    )
    op.execute(
        f"ALTER TABLE changes ALTER COLUMN category TYPE {TYPE_NAME} "
        f"USING category::text::{TYPE_NAME}"
    )
    op.execute(f"DROP TYPE {TEMP_NAME}")
    op.execute("ALTER TABLE changes ALTER COLUMN category SET NOT NULL")
