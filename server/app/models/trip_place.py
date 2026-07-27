"""TripPlace ORM — place pool membership for a trip (candidate → planned)."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.utils.datetime import utc_now

if TYPE_CHECKING:
    from app.models.place import Place
    from app.models.trip import Trip


class TripPlaceStatus(str, enum.Enum):
    candidate = "candidate"
    selected = "selected"
    planned = "planned"
    removed = "removed"


class TripPlace(Base):
    __tablename__ = "trip_places"
    __table_args__ = (UniqueConstraint("trip_id", "place_id", name="uq_trip_places_trip_place"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trip_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    place_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("places.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    status: Mapped[TripPlaceStatus] = mapped_column(
        Enum(TripPlaceStatus, name="trip_place_status", native_enum=False, length=16),
        nullable=False,
        default=TripPlaceStatus.candidate,
    )
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    preferred_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    trip: Mapped[Trip] = relationship("Trip", back_populates="trip_places")
    place: Mapped[Place] = relationship("Place", back_populates="trip_places")
