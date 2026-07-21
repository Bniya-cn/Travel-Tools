"""ItineraryItem ORM model."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime, time
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.utils.datetime import utc_now

if TYPE_CHECKING:
    from app.models.place import Place
    from app.models.trip import Trip


class ItemKind(str, enum.Enum):
    activity = "activity"
    transport = "transport"


class ItemCategory(str, enum.Enum):
    place = "place"
    meal = "meal"
    hotel = "hotel"
    rest = "rest"
    custom = "custom"


class ItineraryItem(Base):
    __tablename__ = "itinerary_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trip_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    place_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("places.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    start_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    is_all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kind: Mapped[ItemKind] = mapped_column(
        Enum(ItemKind, name="item_kind", native_enum=False, length=16),
        nullable=False,
    )
    category: Mapped[ItemCategory | None] = mapped_column(
        Enum(ItemCategory, name="item_category", native_enum=False, length=16),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    trip: Mapped[Trip] = relationship("Trip", back_populates="items")
    place: Mapped[Place | None] = relationship("Place", back_populates="items")
