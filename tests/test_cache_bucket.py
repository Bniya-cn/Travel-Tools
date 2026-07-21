"""Time bucket and cache key helpers."""

from datetime import time

from app.services.cache import build_cache_material, get_time_bucket, sha256_cache_key


def test_time_buckets() -> None:
    assert get_time_bucket(time(0, 0)) == "00"
    assert get_time_bucket(time(5, 59)) == "00"
    assert get_time_bucket(time(6, 0)) == "06"
    assert get_time_bucket(time(8, 59)) == "06"
    assert get_time_bucket(time(9, 0)) == "09"
    assert get_time_bucket(time(11, 59)) == "09"
    assert get_time_bucket(time(12, 0)) == "12"
    assert get_time_bucket(time(16, 59)) == "12"
    assert get_time_bucket(time(17, 0)) == "17"
    assert get_time_bucket(time(19, 59)) == "17"
    assert get_time_bucket(time(20, 0)) == "20"
    assert get_time_bucket(time(23, 59)) == "20"


def test_cache_material_includes_place_ids() -> None:
    m = build_cache_material(
        route_type="transit",
        origin_place_id="p1",
        destination_place_id="p2",
        origin_lng=108.9398,
        origin_lat=34.3416,
        dest_lng=108.9532,
        dest_lat=34.3271,
        strategy=7,
        city="西安",
        nightflag=False,
        date_str="2026-10-03",
        time_bucket="09",
    )
    assert "place=p1:p2" in m
    assert "strategy=7" in m
    key = sha256_cache_key(m)
    assert len(key) == 64
