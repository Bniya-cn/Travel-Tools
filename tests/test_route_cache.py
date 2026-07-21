"""RouteCache service tests."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.models.route_cache import RouteCache
from app.schemas.routes import RouteDTO
from app.services import route_cache as route_cache_service
from app.utils.datetime import utc_now


def _sample_route(**overrides) -> RouteDTO:
    data = {
        "route_type": "transit",
        "strategy": 7,
        "duration_seconds": 100,
        "distance_meters": 1000,
        "walking_distance_meters": 100,
        "transfer_count": 1,
        "polyline": [[108.9, 34.2], [109.0, 34.3]],
        "steps": [],
        "provider": "amap",
        "provider_version": "v5",
    }
    data.update(overrides)
    return RouteDTO.model_validate(data)


def test_cache_hit_same_key(db_session) -> None:
    key = route_cache_service.make_cache_key(
        route_type="transit",
        origin_place_id="a",
        destination_place_id="b",
        origin_lng=108.9,
        origin_lat=34.2,
        dest_lng=109.0,
        dest_lat=34.3,
        strategy=7,
        city="西安",
        nightflag=False,
        route_date=date(2026, 10, 1),
        time_bucket="09",
    )
    route = _sample_route()
    route_cache_service.put_cache(
        db_session,
        cache_key=key,
        route=route,
        origin_lng=108.9,
        origin_lat=34.2,
        dest_lng=109.0,
        dest_lat=34.3,
        city="西安",
        nightflag=False,
        route_date=date(2026, 10, 1),
        time_bucket="09",
    )
    hit = route_cache_service.get_fresh_cache(db_session, key)
    assert hit is not None
    assert hit.duration_seconds == 100


def test_strategy_different_miss(db_session) -> None:
    kwargs = dict(
        route_type="transit",
        origin_place_id="a",
        destination_place_id="b",
        origin_lng=108.9,
        origin_lat=34.2,
        dest_lng=109.0,
        dest_lat=34.3,
        city="西安",
        nightflag=False,
        route_date=date(2026, 10, 1),
        time_bucket="09",
    )
    k1 = route_cache_service.make_cache_key(strategy=7, **kwargs)
    k2 = route_cache_service.make_cache_key(strategy=0, **kwargs)
    assert k1 != k2


def test_city_different_miss() -> None:
    base = dict(
        route_type="walking",
        origin_place_id="a",
        destination_place_id="b",
        origin_lng=1.0,
        origin_lat=2.0,
        dest_lng=3.0,
        dest_lat=4.0,
        strategy=0,
        nightflag=False,
        route_date=date(2026, 10, 1),
        time_bucket="09",
    )
    assert route_cache_service.make_cache_key(city="西安", **base) != route_cache_service.make_cache_key(
        city="北京", **base
    )


def test_bucket_different_miss() -> None:
    base = dict(
        route_type="walking",
        origin_place_id="a",
        destination_place_id="b",
        origin_lng=1.0,
        origin_lat=2.0,
        dest_lng=3.0,
        dest_lat=4.0,
        strategy=0,
        city="西安",
        nightflag=False,
        route_date=date(2026, 10, 1),
    )
    assert route_cache_service.make_cache_key(time_bucket="09", **base) != route_cache_service.make_cache_key(
        time_bucket="12", **base
    )


def test_ttl_expired(db_session) -> None:
    key = "expired-key"
    row = RouteCache(
        cache_key=key,
        route_type="walking",
        strategy=0,
        origin_lng=Decimal("1.000000"),
        origin_lat=Decimal("2.000000"),
        destination_lng=Decimal("3.000000"),
        destination_lat=Decimal("4.000000"),
        city1="西安",
        city2="西安",
        nightflag=False,
        date=date(2026, 10, 1),
        time_bucket="09",
        provider="amap",
        provider_version="v5",
        normalized_response_json=_sample_route(route_type="walking", strategy=0).model_dump(mode="json"),
        created_at=utc_now() - timedelta(hours=20),
        expires_at=utc_now() - timedelta(hours=1),
        hit_count=0,
    )
    db_session.add(row)
    db_session.commit()
    assert route_cache_service.get_fresh_cache(db_session, key) is None
