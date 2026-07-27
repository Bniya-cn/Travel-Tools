"""Auto transport segment persist / cleanup."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, ErrorCode
from app.models.itinerary_item import ItemKind, ItineraryItem
from app.models.route_segment import RouteSegment
from app.schemas.routes import RouteDTO, RouteSegmentResponse
from app.services.amap_routes import format_route_steps_summary
from app.services.preview_token import verify_preview_token
from app.services.route_resolve import RouteEndpoints, get_route_with_cache, resolve_endpoints
from app.utils.datetime import utc_now


def _add_seconds(t, seconds: int):
    base = datetime.combine(datetime.today().date(), t)
    return (base + timedelta(seconds=seconds)).time()


def _seconds_between(start, end) -> int:
    a = datetime.combine(datetime.today().date(), start)
    b = datetime.combine(datetime.today().date(), end)
    return int((b - a).total_seconds())


def reorder_day_sort_order(db: Session, trip_id: str, day) -> None:
    items = db.scalars(
        select(ItineraryItem)
        .where(ItineraryItem.trip_id == trip_id, ItineraryItem.date == day)
        .order_by(
            ItineraryItem.is_all_day.desc(),
            ItineraryItem.start_time.asc().nulls_last(),
            ItineraryItem.created_at.asc(),
        )
    ).all()
    for idx, item in enumerate(items):
        item.sort_order = idx


def delete_segment_and_transport(db: Session, segment: RouteSegment) -> None:
    transport_id = segment.transport_item_id
    db.delete(segment)
    db.flush()
    transport = db.get(ItineraryItem, transport_id)
    if transport is not None:
        db.delete(transport)


def cleanup_segments_for_item(db: Session, item_id: str) -> None:
    segments = db.scalars(
        select(RouteSegment).where(
            (RouteSegment.after_item_id == item_id)
            | (RouteSegment.before_item_id == item_id)
            | (RouteSegment.transport_item_id == item_id)
        )
    ).all()
    for seg in segments:
        delete_segment_and_transport(db, seg)


def cleanup_segments_for_trip(db: Session, trip_id: str) -> None:
    segments = db.scalars(select(RouteSegment).where(RouteSegment.trip_id == trip_id)).all()
    for seg in segments:
        delete_segment_and_transport(db, seg)


async def persist_route_segment(
    db: Session,
    *,
    after_item_id: str,
    before_item_id: str,
    route_type: str,
    strategy: int | None,
    preview_token: str,
) -> RouteSegmentResponse:
    endpoints = resolve_endpoints(db, after_item_id=after_item_id, before_item_id=before_item_id)
    if route_type == "transit":
        strat = strategy if strategy is not None else 7
    else:
        strat = strategy if strategy is not None else 0

    route, _hit = await get_route_with_cache(
        db, endpoints, route_type=route_type, strategy=strat
    )
    verify_preview_token(
        preview_token,
        trip_id=endpoints.trip.id,
        after_item_id=after_item_id,
        before_item_id=before_item_id,
        route_type=route_type,
        strategy=strat,
        route=route,
    )

    start_time = endpoints.after.end_time
    assert start_time is not None
    end_time = _add_seconds(start_time, route.duration_seconds)
    available = _seconds_between(start_time, endpoints.before.start_time)
    if route.duration_seconds > available:
        raise AppError(
            ErrorCode.TRANSPORT_TIME_CONFLICT,
            "交通时长超过活动空档",
            details={
                "required_duration_seconds": route.duration_seconds,
                "available_duration_seconds": available,
            },
            status_code=409,
        )
    # Cross-midnight check: adding duration wrapped past midnight if end < start
    if end_time < start_time:
        raise AppError(
            ErrorCode.CROSS_MIDNIGHT_NOT_ALLOWED,
            "交通段不可跨午夜",
            status_code=422,
        )

    title = f"前往{endpoints.destination.name}"
    if any((s.mode == "transit") for s in route.steps):
        title = f"公交/地铁前往{endpoints.destination.name}"
    description = format_route_steps_summary(route.steps)

    existing = db.scalar(
        select(RouteSegment).where(
            RouteSegment.trip_id == endpoints.trip.id,
            RouteSegment.after_item_id == after_item_id,
            RouteSegment.before_item_id == before_item_id,
        )
    )

    try:
        if existing is None:
            transport = ItineraryItem(
                trip_id=endpoints.trip.id,
                place_id=None,
                date=endpoints.route_date,
                start_time=start_time,
                end_time=end_time,
                is_all_day=False,
                kind=ItemKind.transport,
                category=None,
                title=title,
                description=description,
                sort_order=0,
            )
            db.add(transport)
            db.flush()
            segment = RouteSegment(
                trip_id=endpoints.trip.id,
                transport_item_id=transport.id,
                after_item_id=after_item_id,
                before_item_id=before_item_id,
                origin_place_id=endpoints.origin.id,
                destination_place_id=endpoints.destination.id,
                origin_name=endpoints.origin.name,
                origin_lng=Decimal(f"{endpoints.origin_lng:.6f}"),
                origin_lat=Decimal(f"{endpoints.origin_lat:.6f}"),
                destination_name=endpoints.destination.name,
                destination_lng=Decimal(f"{endpoints.dest_lng:.6f}"),
                destination_lat=Decimal(f"{endpoints.dest_lat:.6f}"),
                route_type=route_type,
                strategy=strat,
                duration_seconds=route.duration_seconds,
                distance_meters=route.distance_meters,
                walking_distance_meters=route.walking_distance_meters,
                transfer_count=route.transfer_count,
                polyline_json=route.polyline,
                steps_json=[s.model_dump(mode="json") for s in route.steps],
                provider=route.provider,
                provider_version=route.provider_version,
            )
            db.add(segment)
        else:
            transport = db.get(ItineraryItem, existing.transport_item_id)
            if transport is None:
                raise AppError(ErrorCode.INTERNAL_ERROR, "交通事项缺失", status_code=500)
            transport.start_time = start_time
            transport.end_time = end_time
            transport.title = title
            transport.description = description
            transport.updated_at = utc_now()
            existing.route_type = route_type
            existing.strategy = strat
            existing.duration_seconds = route.duration_seconds
            existing.distance_meters = route.distance_meters
            existing.walking_distance_meters = route.walking_distance_meters
            existing.transfer_count = route.transfer_count
            existing.polyline_json = route.polyline
            existing.steps_json = [s.model_dump(mode="json") for s in route.steps]
            existing.origin_place_id = endpoints.origin.id
            existing.destination_place_id = endpoints.destination.id
            existing.origin_name = endpoints.origin.name
            existing.destination_name = endpoints.destination.name
            existing.origin_lng = Decimal(f"{endpoints.origin_lng:.6f}")
            existing.origin_lat = Decimal(f"{endpoints.origin_lat:.6f}")
            existing.destination_lng = Decimal(f"{endpoints.dest_lng:.6f}")
            existing.destination_lat = Decimal(f"{endpoints.dest_lat:.6f}")
            existing.updated_at = utc_now()
            segment = existing

        reorder_day_sort_order(db, endpoints.trip.id, endpoints.route_date)
        db.commit()
        db.refresh(segment)
        return RouteSegmentResponse.model_validate(segment)
    except IntegrityError:
        db.rollback()
        existing = db.scalar(
            select(RouteSegment).where(
                RouteSegment.trip_id == endpoints.trip.id,
                RouteSegment.after_item_id == after_item_id,
                RouteSegment.before_item_id == before_item_id,
            )
        )
        if existing is None:
            raise AppError(ErrorCode.CONFLICT, "路线段写入冲突", status_code=409) from None
        return RouteSegmentResponse.model_validate(existing)
