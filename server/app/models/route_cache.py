"""RouteCache ORM — provider response cache, not user data."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, Date, DateTime, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import JSON

from app.db.base import Base
from app.utils.datetime import utc_now


class RouteCache(Base):
    __tablename__ = "route_caches"
    __table_args__ = (UniqueConstraint("cache_key", name="uq_route_caches_cache_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    cache_key: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    route_type: Mapped[str] = mapped_column(String(16), nullable=False)
    strategy: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    origin_lng: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    origin_lat: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    destination_lng: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    destination_lat: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    city1: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city2: Mapped[str | None] = mapped_column(String(100), nullable=True)
    nightflag: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    time_bucket: Mapped[str] = mapped_column(String(10), nullable=False)
    provider: Mapped[str] = mapped_column(String(16), nullable=False, default="amap")
    provider_version: Mapped[str] = mapped_column(String(16), nullable=False, default="v5")
    # Must store standard RouteDTO JSON only — never raw Amap payload.
    normalized_response_json: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_hit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    hit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
