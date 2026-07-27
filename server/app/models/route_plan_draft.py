"""RoutePlanDraft ORM — temporary day plan before Items/Segments exist."""

from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Date, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.db.base import Base
from app.utils.datetime import utc_now

if TYPE_CHECKING:
    from app.models.trip import Trip


class DraftSource(str, enum.Enum):
    ai = "ai"
    manual = "manual"


class DraftStatus(str, enum.Enum):
    draft = "draft"
    confirmed = "confirmed"
    cancelled = "cancelled"


class RoutePlanDraft(Base):
    __tablename__ = "route_plan_drafts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    trip_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    source: Mapped[DraftSource] = mapped_column(
        Enum(DraftSource, name="draft_source", native_enum=False, length=16),
        nullable=False,
        default=DraftSource.manual,
    )
    # Frozen shape: [{place_id, title, start_time, end_time, order, preferred_duration_minutes?}]
    stops_json: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[DraftStatus] = mapped_column(
        Enum(DraftStatus, name="draft_status", native_enum=False, length=16),
        nullable=False,
        default=DraftStatus.draft,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    trip: Mapped[Trip] = relationship("Trip", back_populates="route_plan_drafts")
