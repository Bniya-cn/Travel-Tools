"""Create trip_places and route_plan_drafts; backfill TripPlace from places.

Revision ID: 0005_map_workspace
Revises: 0004_routes
Create Date: 2026-07-21
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005_map_workspace"
down_revision: Union[str, Sequence[str], None] = "0004_routes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trip_places",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("trip_id", sa.String(length=36), nullable=False),
        sa.Column("place_id", sa.String(length=36), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("preferred_duration", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["place_id"], ["places.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("trip_id", "place_id", name="uq_trip_places_trip_place"),
    )
    op.create_index("ix_trip_places_trip_id", "trip_places", ["trip_id"])
    op.create_index("ix_trip_places_place_id", "trip_places", ["place_id"])

    op.create_table(
        "route_plan_drafts",
        sa.Column("id", sa.String(length=36), primary_key=True, nullable=False),
        sa.Column("trip_id", sa.String(length=36), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("stops_json", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["trip_id"], ["trips.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_route_plan_drafts_trip_id", "route_plan_drafts", ["trip_id"])
    op.create_index("ix_route_plan_drafts_date", "route_plan_drafts", ["date"])

    # Backfill: existing places become candidate TripPlaces
    conn = op.get_bind()
    places = conn.execute(
        sa.text("SELECT id, trip_id, created_at, updated_at FROM places ORDER BY created_at")
    ).fetchall()
    by_trip: dict[str, int] = {}
    for row in places:
        place_id, trip_id, created_at, updated_at = row
        idx = by_trip.get(trip_id, 0)
        by_trip[trip_id] = idx + 1
        conn.execute(
            sa.text(
                """
                INSERT INTO trip_places
                  (id, trip_id, place_id, status, order_index, preferred_duration, notes, created_at, updated_at)
                VALUES
                  (:id, :trip_id, :place_id, 'candidate', :order_index, NULL, NULL, :created_at, :updated_at)
                """
            ),
            {
                "id": str(__import__("uuid").uuid4()),
                "trip_id": trip_id,
                "place_id": place_id,
                "order_index": idx,
                "created_at": created_at,
                "updated_at": updated_at,
            },
        )


def downgrade() -> None:
    op.drop_index("ix_route_plan_drafts_date", table_name="route_plan_drafts")
    op.drop_index("ix_route_plan_drafts_trip_id", table_name="route_plan_drafts")
    op.drop_table("route_plan_drafts")
    op.drop_index("ix_trip_places_place_id", table_name="trip_places")
    op.drop_index("ix_trip_places_trip_id", table_name="trip_places")
    op.drop_table("trip_places")
