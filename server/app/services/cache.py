"""Route cache key helpers and time buckets."""

from __future__ import annotations

import hashlib
from datetime import time


def get_time_bucket(t: time) -> str:
    """Map local time to cache bucket: 00/06/09/12/17/20."""
    minutes = t.hour * 60 + t.minute
    if minutes < 6 * 60:
        return "00"
    if minutes < 9 * 60:
        return "06"
    if minutes < 12 * 60:
        return "09"
    if minutes < 17 * 60:
        return "12"
    if minutes < 20 * 60:
        return "17"
    return "20"


def nightflag_from_time(t: time) -> bool:
    return t.hour >= 18 or t.hour < 6


def format_coord(value: float) -> str:
    return f"{float(value):.6f}"


def build_cache_material(
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
    date_str: str,
    time_bucket: str,
    provider: str = "amap",
    provider_version: str = "v5",
) -> str:
    return ":".join(
        [
            provider,
            provider_version,
            route_type,
            f"place={origin_place_id}:{destination_place_id}",
            f"{format_coord(origin_lng)},{format_coord(origin_lat)}",
            f"{format_coord(dest_lng)},{format_coord(dest_lat)}",
            f"strategy={strategy}",
            f"city={city}",
            f"night={1 if nightflag else 0}",
            f"date={date_str}",
            f"bucket={time_bucket}",
        ]
    )


def sha256_cache_key(material: str) -> str:
    return hashlib.sha256(material.encode("utf-8")).hexdigest()
