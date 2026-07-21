"""RouteSegment ORM — user-confirmed route between two activity items."""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base
from app.utils.datetime import utc_now

if TYPE_CHECKING:
    from app.models.itinerary_item import ItineraryItem
    from app.models.place import Place
    from app.models.trip import Trip


class RouteSegment(Base):
    __tablename__ = "route_segments"
    __table_args__ = (
        UniqueConstraint(
            "trip_id",
            "after_item_id",
            "before_item_id",
            name="uq_route_segments_trip_after_before",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trip_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # No CASCADE — business layer must delete Segment + transport Item explicitly.
    transport_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("itinerary_items.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,
    )
    after_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("itinerary_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    before_item_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("itinerary_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    origin_place_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("places.id", ondelete="SET NULL"),
        nullable=True,
    )
    destination_place_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("places.id", ondelete="SET NULL"),
        nullable=True,
    )
    origin_name: Mapped[str] = mapped_column(String(200), nullable=False)
    origin_lng: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    origin_lat: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    destination_name: Mapped[str] = mapped_column(String(200), nullable=False)
    destination_lng: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    destination_lat: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    route_type: Mapped[str] = mapped_column(String(16), nullable=False)
    strategy: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    distance_meters: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    walking_distance_meters: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transfer_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Polyline contract: [[lng, lat], ...]
    polyline_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    steps_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="amap")
    provider_version: Mapped[str] = mapped_column(String(16), nullable=False, default="v5")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    trip: Mapped[Trip] = relationship("Trip", back_populates="route_segments")
    transport_item: Mapped[ItineraryItem] = relationship(
        "ItineraryItem",
        foreign_keys=[transport_item_id],
    )
    after_item: Mapped[ItineraryItem] = relationship(
        "ItineraryItem",
        foreign_keys=[after_item_id],
    )
    before_item: Mapped[ItineraryItem] = relationship(
        "ItineraryItem",
        foreign_keys=[before_item_id],
    )
    origin_place: Mapped[Place | None] = relationship("Place", foreign_keys=[origin_place_id])
    destination_place: Mapped[Place | None] = relationship("Place", foreign_keys=[destination_place_id])
