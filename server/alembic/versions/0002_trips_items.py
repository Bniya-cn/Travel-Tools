"""Create trips and itinerary_items tables.

Revision ID: 0002_trips_items
Revises: 0001_baseline
Create Date: 2026-07-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002_trips_items"
down_revision: Union[str, Sequence[str], None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("city_name", sa.String(length=100), nullable=False),
        sa.Column("city_code", sa.String(length=20), nullable=True),
        sa.Column("timezone", sa.String(length=50), nullable=False, server_default="Asia/Shanghai"),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "itinerary_items",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("trip_id", sa.String(length=36), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("is_all_day", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=16), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_itinerary_items_trip_id", "itinerary_items", ["trip_id"])
    op.create_index("ix_itinerary_items_date", "itinerary_items", ["date"])


def downgrade() -> None:
    op.drop_index("ix_itinerary_items_date", table_name="itinerary_items")
    op.drop_index("ix_itinerary_items_trip_id", table_name="itinerary_items")
    op.drop_table("itinerary_items")
    op.drop_table("trips")
