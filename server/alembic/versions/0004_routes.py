"""Create route_caches / route_segments; drop city_code columns.

Revision ID: 0004_routes
Revises: 0003_places
Create Date: 2026-07-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_routes"
down_revision: Union[str, Sequence[str], None] = "0003_places"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("trips") as batch:
        batch.drop_column("city_code")

    with op.batch_alter_table("places") as batch:
        batch.drop_column("city_code")

    op.create_table(
        "route_caches",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("cache_key", sa.String(length=128), nullable=False),
        sa.Column("route_type", sa.String(length=16), nullable=False),
        sa.Column("strategy", sa.Integer(), nullable=False),
        sa.Column("origin_lng", sa.Numeric(10, 6), nullable=False),
        sa.Column("origin_lat", sa.Numeric(10, 6), nullable=False),
        sa.Column("destination_lng", sa.Numeric(10, 6), nullable=False),
        sa.Column("destination_lat", sa.Numeric(10, 6), nullable=False),
        sa.Column("city1", sa.String(length=100), nullable=True),
        sa.Column("city2", sa.String(length=100), nullable=True),
        sa.Column("nightflag", sa.Boolean(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("time_bucket", sa.String(length=10), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("provider_version", sa.String(length=16), nullable=False),
        sa.Column("normalized_response_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_hit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("hit_count", sa.Integer(), nullable=False),
        sa.UniqueConstraint("cache_key", name="uq_route_caches_cache_key"),
    )
    op.create_index("ix_route_caches_cache_key", "route_caches", ["cache_key"])

    op.create_table(
        "route_segments",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("trip_id", sa.String(length=36), nullable=False),
        sa.Column("transport_item_id", sa.String(length=36), nullable=False),
        sa.Column("after_item_id", sa.String(length=36), nullable=False),
        sa.Column("before_item_id", sa.String(length=36), nullable=False),
        sa.Column("origin_place_id", sa.String(length=36), nullable=True),
        sa.Column("destination_place_id", sa.String(length=36), nullable=True),
        sa.Column("origin_name", sa.String(length=200), nullable=False),
        sa.Column("origin_lng", sa.Numeric(10, 6), nullable=False),
        sa.Column("origin_lat", sa.Numeric(10, 6), nullable=False),
        sa.Column("destination_name", sa.String(length=200), nullable=False),
        sa.Column("destination_lng", sa.Numeric(10, 6), nullable=False),
        sa.Column("destination_lat", sa.Numeric(10, 6), nullable=False),
        sa.Column("route_type", sa.String(length=16), nullable=False),
        sa.Column("strategy", sa.Integer(), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("distance_meters", sa.Integer(), nullable=False),
        sa.Column("walking_distance_meters", sa.Integer(), nullable=True),
        sa.Column("transfer_count", sa.Integer(), nullable=False),
        sa.Column("polyline_json", sa.JSON(), nullable=True),
        sa.Column("steps_json", sa.JSON(), nullable=True),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("provider_version", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["transport_item_id"],
            ["itinerary_items.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["after_item_id"],
            ["itinerary_items.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["before_item_id"],
            ["itinerary_items.id"],
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(["origin_place_id"], ["places.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["destination_place_id"], ["places.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("transport_item_id", name="uq_route_segments_transport_item"),
        sa.UniqueConstraint(
            "trip_id",
            "after_item_id",
            "before_item_id",
            name="uq_route_segments_trip_after_before",
        ),
    )
    op.create_index("ix_route_segments_trip_id", "route_segments", ["trip_id"])


def downgrade() -> None:
    op.drop_index("ix_route_segments_trip_id", table_name="route_segments")
    op.drop_table("route_segments")
    op.drop_index("ix_route_caches_cache_key", table_name="route_caches")
    op.drop_table("route_caches")

    with op.batch_alter_table("places") as batch:
        batch.add_column(sa.Column("city_code", sa.String(length=50), nullable=True))

    with op.batch_alter_table("trips") as batch:
        batch.add_column(sa.Column("city_code", sa.String(length=20), nullable=True))
