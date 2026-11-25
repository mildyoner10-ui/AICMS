"""migrate change_category enum: NETWORK/SERVER/... → HEAD_OFFICE/CHANNEL/BRANCH_OFFICE/OTHER

Revision ID: a1b2c3d4e5f6
Revises: 9a1f4c2e6b07
Create Date: 2026-11-23 09:00:00.000000

Old categories (NETWORK, SERVER, APPLICATION, DATABASE, SECURITY, INFRASTRUCTURE)
are all mapped to OTHER. New categories reflect office/line-of-business split.
"""
from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "9a1f4c2e6b07"
branch_labels = None
depends_on = None

# Old enum type name (as defined in the model at migration time)
OLD_ENUM = "changecategory"
NEW_ENUM = "changecategory_v2"

# Mapping: old values → new values. Everything not listed goes to OTHER.
CAT_MAP = {
    "NETWORK": "OTHER",
    "SERVER": "OTHER",
    "APPLICATION": "OTHER",
    "DATABASE": "OTHER",
    "SECURITY": "OTHER",
    "INFRASTRUCTURE": "OTHER",
}


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Drop NOT NULL constraint on category column
    op.execute("ALTER TABLE changes ALTER COLUMN category DROP NOT NULL")

    # 2. Map old values to new
    for old, new in CAT_MAP.items():
        op.execute(f"UPDATE changes SET category = '{new}' WHERE category = '{old}'")

    # 3. Map old enum values → OTHER (safe: cast to text to avoid referencing non-existent enum values)
    op.execute("UPDATE changes SET category = 'OTHER' WHERE category::text != 'OTHER'")

    # 4. Rename enum type
    op.execute(f"ALTER TYPE {OLD_ENUM} RENAME TO {OLD_ENUM}_old")
    op.execute(f"CREATE TYPE {NEW_ENUM} AS ENUM ('HEAD_OFFICE', 'CHANNEL', 'BRANCH_OFFICE', 'OTHER')")

    # 5. Re-assign column to new type
    op.execute(
        'ALTER TABLE changes ALTER COLUMN category TYPE ' + NEW_ENUM + " USING category::text::\"" + NEW_ENUM + "\""
    )

    # 6. Drop old enum type
    op.execute(f"DROP TYPE {OLD_ENUM}_old")

    # 7. Restore NOT NULL
    op.execute("ALTER TABLE changes ALTER COLUMN category SET NOT NULL")

    # 8. Update Alembic version to include new type in model metadata
    #    (Alembic uses the enum from the model at migration time, so we're good —
    #     but we need to tell Alembic the new type name is what the model now uses.)


def downgrade() -> None:
    conn = op.get_bind()

    op.execute("ALTER TABLE changes ALTER COLUMN category DROP NOT NULL")

    # Restore old enum
    op.execute(
        f"CREATE TYPE {OLD_ENUM} AS ENUM ('NETWORK', 'SERVER', 'APPLICATION', 'DATABASE', 'SECURITY', 'INFRASTRUCTURE', 'OTHER')"
    )
    op.execute(
        f"ALTER TABLE changes ALTER COLUMN category TYPE {OLD_ENUM} USING category::text::{OLD_ENUM}"
    )
    op.execute("DROP TYPE changecategory_v2")

    # Un-map (all OTHER → NETWORK as fallback for downgrade)
    op.execute("UPDATE changes SET category = 'NETWORK' WHERE category = 'OTHER'")

    op.execute("ALTER TABLE changes ALTER COLUMN category SET NOT NULL")
