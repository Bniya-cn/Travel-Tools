"""Initial empty schema baseline — no business tables yet.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-07-21
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op  # noqa: F401
import sqlalchemy as sa  # noqa: F401

revision: str = "0001_baseline"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Intentionally empty: infrastructure-only phase.
    pass


def downgrade() -> None:
    pass
