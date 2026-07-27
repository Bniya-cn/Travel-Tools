"""Shared helpers to resolve after/before items and fetch routes with cache."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, time
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import AppError, ErrorCode
from app.models.itinerary_item import ItemKind, ItineraryItem
from app.models.place import Place
from app.models.trip import Trip
from app.schemas.routes import RouteDTO
from app.services import amap_routes
from app.services.cache import get_time_bucket, nightflag_from_time
from app.services import route_cache as route_cache_service


@dataclass
class RouteEndpoints:
    trip: Trip
    after: ItineraryItem
    before: ItineraryItem
    origin: Place
    destination: Place
    origin_lng: float
    origin_lat: float
    dest_lng: float
    dest_lat: float
    route_date: date
    depart_time: time
    time_bucket: str
    nightflag: bool


def _dec(value: Decimal | float) -> float:
    return float(value)


def resolve_endpoints(
    db: Session,
    *,
    after_item_id: str,
    before_item_id: str,
) -> RouteEndpoints:
    after = db.get(ItineraryItem, after_item_id)
    before = db.get(ItineraryItem, before_item_id)
    if after is None or before is None:
        raise AppError(ErrorCode.NOT_FOUND, "事项不存在", status_code=404)
    if after.trip_id != before.trip_id:
        raise AppError(ErrorCode.VALIDATION_ERROR, "事项必须属于同一旅行", status_code=422)
    if after.kind != ItemKind.activity or before.kind != ItemKind.activity:
        raise AppError(ErrorCode.VALIDATION_ERROR, "路线仅支持活动事项之间", status_code=422)
    if after.date != before.date:
        raise AppError(ErrorCode.VALIDATION_ERROR, "路线事项必须同一天", status_code=422)
    if after.end_time is None or before.start_time is None:
        raise AppError(ErrorCode.VALIDATION_ERROR, "事项缺少起止时间，无法规划路线", status_code=422)
    if after.end_time > before.start_time:
        raise AppError(ErrorCode.VALIDATION_ERROR, "after 必须早于 before", status_code=422)
    if not after.place_id or not before.place_id:
        raise AppError(ErrorCode.VALIDATION_ERROR, "事项必须关联地点", status_code=422)

    origin = db.get(Place, after.place_id)
    destination = db.get(Place, before.place_id)
    if origin is None or destination is None:
        raise AppError(ErrorCode.NOT_FOUND, "地点不存在", status_code=404)

    trip = db.get(Trip, after.trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)

    depart = after.end_time
    return RouteEndpoints(
        trip=trip,
        after=after,
        before=before,
        origin=origin,
        destination=destination,
        origin_lng=_dec(origin.lng),
        origin_lat=_dec(origin.lat),
        dest_lng=_dec(destination.lng),
        dest_lat=_dec(destination.lat),
        route_date=after.date,
        depart_time=depart,
        time_bucket=get_time_bucket(depart),
        nightflag=nightflag_from_time(depart),
    )


async def get_route_with_cache(
    db: Session,
    endpoints: RouteEndpoints,
    *,
    route_type: str,
    strategy: int,
) -> tuple[RouteDTO, bool]:
    cache_key = route_cache_service.make_cache_key(
        route_type=route_type,
        origin_place_id=endpoints.origin.id,
        destination_place_id=endpoints.destination.id,
        origin_lng=endpoints.origin_lng,
        origin_lat=endpoints.origin_lat,
        dest_lng=endpoints.dest_lng,
        dest_lat=endpoints.dest_lat,
        strategy=strategy,
        city=endpoints.trip.city_name,
        nightflag=endpoints.nightflag,
        route_date=endpoints.route_date,
        time_bucket=endpoints.time_bucket,
    )
    cached = route_cache_service.get_fresh_cache(db, cache_key)
    if cached is not None:
        return cached, True

    if route_type == "transit":
        route = await amap_routes.fetch_transit_route(
            origin_lng=endpoints.origin_lng,
            origin_lat=endpoints.origin_lat,
            dest_lng=endpoints.dest_lng,
            dest_lat=endpoints.dest_lat,
            city_name=endpoints.trip.city_name,
            strategy=strategy,
            nightflag=endpoints.nightflag,
        )
    elif route_type == "walking":
        route = await amap_routes.fetch_walking_route(
            origin_lng=endpoints.origin_lng,
            origin_lat=endpoints.origin_lat,
            dest_lng=endpoints.dest_lng,
            dest_lat=endpoints.dest_lat,
        )
        route = route.model_copy(update={"strategy": strategy})
    else:
        raise AppError(ErrorCode.VALIDATION_ERROR, "不支持的路线类型", status_code=422)

    route_cache_service.put_cache(
        db,
        cache_key=cache_key,
        route=route,
        origin_lng=endpoints.origin_lng,
        origin_lat=endpoints.origin_lat,
        dest_lng=endpoints.dest_lng,
        dest_lat=endpoints.dest_lat,
        city=endpoints.trip.city_name,
        nightflag=endpoints.nightflag,
        route_date=endpoints.route_date,
        time_bucket=endpoints.time_bucket,
    )
    return route, False


@dataclass
class PlacePairEndpoints:
    trip: Trip
    origin: Place
    destination: Place
    origin_lng: float
    origin_lat: float
    dest_lng: float
    dest_lat: float
    route_date: date
    depart_time: time
    time_bucket: str
    nightflag: bool


def resolve_place_pair(
    db: Session,
    *,
    trip_id: str,
    origin_place_id: str,
    destination_place_id: str,
    route_date: date,
    depart_time: time,
) -> PlacePairEndpoints:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    origin = db.get(Place, origin_place_id)
    destination = db.get(Place, destination_place_id)
    if origin is None or destination is None:
        raise AppError(ErrorCode.NOT_FOUND, "地点不存在", status_code=404)
    if origin.trip_id != trip_id or destination.trip_id != trip_id:
        raise AppError(ErrorCode.VALIDATION_ERROR, "地点必须属于该旅行", status_code=422)
    return PlacePairEndpoints(
        trip=trip,
        origin=origin,
        destination=destination,
        origin_lng=_dec(origin.lng),
        origin_lat=_dec(origin.lat),
        dest_lng=_dec(destination.lng),
        dest_lat=_dec(destination.lat),
        route_date=route_date,
        depart_time=depart_time,
        time_bucket=get_time_bucket(depart_time),
        nightflag=nightflag_from_time(depart_time),
    )


async def get_route_for_place_pair(
    db: Session,
    endpoints: PlacePairEndpoints,
    *,
    route_type: str,
    strategy: int,
) -> tuple[RouteDTO, bool]:
    """Fetch route between two Places (draft preview — no Items required)."""
    cache_key = route_cache_service.make_cache_key(
        route_type=route_type,
        origin_place_id=endpoints.origin.id,
        destination_place_id=endpoints.destination.id,
        origin_lng=endpoints.origin_lng,
        origin_lat=endpoints.origin_lat,
        dest_lng=endpoints.dest_lng,
        dest_lat=endpoints.dest_lat,
        strategy=strategy,
        city=endpoints.trip.city_name,
        nightflag=endpoints.nightflag,
        route_date=endpoints.route_date,
        time_bucket=endpoints.time_bucket,
    )
    cached = route_cache_service.get_fresh_cache(db, cache_key)
    if cached is not None:
        return cached, True

    if route_type == "transit":
        route = await amap_routes.fetch_transit_route(
            origin_lng=endpoints.origin_lng,
            origin_lat=endpoints.origin_lat,
            dest_lng=endpoints.dest_lng,
            dest_lat=endpoints.dest_lat,
            city_name=endpoints.trip.city_name,
            strategy=strategy,
            nightflag=endpoints.nightflag,
        )
    elif route_type == "walking":
        route = await amap_routes.fetch_walking_route(
            origin_lng=endpoints.origin_lng,
            origin_lat=endpoints.origin_lat,
            dest_lng=endpoints.dest_lng,
            dest_lat=endpoints.dest_lat,
        )
        route = route.model_copy(update={"strategy": strategy})
    else:
        raise AppError(ErrorCode.VALIDATION_ERROR, "不支持的路线类型", status_code=422)

    route_cache_service.put_cache(
        db,
        cache_key=cache_key,
        route=route,
        origin_lng=endpoints.origin_lng,
        origin_lat=endpoints.origin_lat,
        dest_lng=endpoints.dest_lng,
        dest_lat=endpoints.dest_lat,
        city=endpoints.trip.city_name,
        nightflag=endpoints.nightflag,
        route_date=endpoints.route_date,
        time_bucket=endpoints.time_bucket,
    )
    return route, False
