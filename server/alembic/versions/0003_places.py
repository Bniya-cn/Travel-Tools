"""Create places table and add itinerary_items.place_id.

Revision ID: 0003_places
Revises: 0002_trips_items
Create Date: 2026-07-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0003_places"
down_revision: Union[str, Sequence[str], None] = "0002_trips_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("trip_id", sa.String(length=36), nullable=False),
        sa.Column("amap_poi_id", sa.String(length=100), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=True),
        sa.Column("city_name", sa.String(length=100), nullable=True),
        sa.Column("city_code", sa.String(length=50), nullable=True),
        sa.Column("district", sa.String(length=100), nullable=True),
        sa.Column("lng", sa.Numeric(10, 6), nullable=False),
        sa.Column("lat", sa.Numeric(10, 6), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("trip_id", "amap_poi_id", name="uq_places_trip_amap_poi"),
    )
    op.create_index("ix_places_trip_id", "places", ["trip_id"])

    with op.batch_alter_table("itinerary_items") as batch:
        batch.add_column(sa.Column("place_id", sa.String(length=36), nullable=True))
        batch.create_index("ix_itinerary_items_place_id", ["place_id"])
        batch.create_foreign_key(
            "fk_itinerary_items_place_id",
            "places",
            ["place_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("itinerary_items") as batch:
        batch.drop_constraint("fk_itinerary_items_place_id", type_="foreignkey")
        batch.drop_index("ix_itinerary_items_place_id")
        batch.drop_column("place_id")

    op.drop_index("ix_places_trip_id", table_name="places")
    op.drop_table("places")
