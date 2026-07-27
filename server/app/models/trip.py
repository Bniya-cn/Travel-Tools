"""Trip ORM model."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.utils.datetime import utc_now

if TYPE_CHECKING:
    from app.models.itinerary_item import ItineraryItem
    from app.models.place import Place
    from app.models.route_plan_draft import RoutePlanDraft
    from app.models.route_segment import RouteSegment
    from app.models.trip_place import TripPlace


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    city_name: Mapped[str] = mapped_column(String(100), nullable=False)
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Asia/Shanghai")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    items: Mapped[list[ItineraryItem]] = relationship(
        "ItineraryItem",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
    places: Mapped[list[Place]] = relationship(
        "Place",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
    route_segments: Mapped[list[RouteSegment]] = relationship(
        "RouteSegment",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
    trip_places: Mapped[list[TripPlace]] = relationship(
        "TripPlace",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
    route_plan_drafts: Mapped[list[RoutePlanDraft]] = relationship(
        "RoutePlanDraft",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
