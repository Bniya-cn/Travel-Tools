"""RouteCache read/write — stores RouteDTO JSON only; TTL 12h."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.route_cache import RouteCache
from app.schemas.routes import RouteDTO
from app.services.cache import build_cache_material, sha256_cache_key
from app.utils.datetime import utc_now

logger = logging.getLogger("travel_planner.route_cache")


def _as_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def make_cache_key(
    *,
    route_type: str,
    origin_place_id: str,
    destination_place_id: str,
    origin_lng: float,
    origin_lat: float,
    dest_lng: float,
    dest_lat: float,
    strategy: int,
    city: str,
    nightflag: bool,
    route_date: date,
    time_bucket: str,
) -> str:
    material = build_cache_material(
        route_type=route_type,
        origin_place_id=origin_place_id,
        destination_place_id=destination_place_id,
        origin_lng=origin_lng,
        origin_lat=origin_lat,
        dest_lng=dest_lng,
        dest_lat=dest_lat,
        strategy=strategy,
        city=city,
        nightflag=nightflag,
        date_str=route_date.isoformat(),
        time_bucket=time_bucket,
    )
    return sha256_cache_key(material)


def get_fresh_cache(db: Session, cache_key: str) -> RouteDTO | None:
    row = db.scalar(select(RouteCache).where(RouteCache.cache_key == cache_key))
    if row is None:
        return None
    now = utc_now()
    if _as_aware(row.expires_at) <= now:
        return None
    try:
        dto = RouteDTO.model_validate(row.normalized_response_json)
    except Exception:
        logger.warning("RouteCache JSON is not a valid RouteDTO; ignoring")
        return None
    row.hit_count = int(row.hit_count or 0) + 1
    row.last_hit_at = now
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("Failed to update RouteCache hit counters")
    return dto


def put_cache(
    db: Session,
    *,
    cache_key: str,
    route: RouteDTO,
    origin_lng: float,
    origin_lat: float,
    dest_lng: float,
    dest_lat: float,
    city: str,
    nightflag: bool,
    route_date: date,
    time_bucket: str,
) -> None:
    settings = get_settings()
    now = utc_now()
    expires = now + timedelta(hours=int(settings.route_cache_ttl_hours))
    dto_json = route.model_dump(mode="json")

    try:
        existing = db.scalar(select(RouteCache).where(RouteCache.cache_key == cache_key))
        if existing is None:
            row = RouteCache(
                cache_key=cache_key,
                route_type=route.route_type,
                strategy=route.strategy,
                origin_lng=Decimal(f"{origin_lng:.6f}"),
                origin_lat=Decimal(f"{origin_lat:.6f}"),
                destination_lng=Decimal(f"{dest_lng:.6f}"),
                destination_lat=Decimal(f"{dest_lat:.6f}"),
                city1=city,
                city2=city,
                nightflag=nightflag,
                date=route_date,
                time_bucket=time_bucket,
                provider=route.provider,
                provider_version=route.provider_version,
                normalized_response_json=dto_json,
                created_at=now,
                expires_at=expires,
                last_hit_at=None,
                hit_count=0,
            )
            db.add(row)
        else:
            existing.normalized_response_json = dto_json
            existing.expires_at = expires
            existing.route_type = route.route_type
            existing.strategy = route.strategy
            existing.nightflag = nightflag
            existing.time_bucket = time_bucket
            existing.date = route_date
            existing.city1 = city
            existing.city2 = city
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("Failed to write RouteCache; continuing without cache")
