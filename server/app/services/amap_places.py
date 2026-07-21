"""Amap Web Service place search — never return raw Amap JSON to clients."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.schemas.place import PlaceSearchResult

logger = logging.getLogger("travel_planner.amap")


def _parse_location(location: Any) -> tuple[float, float] | None:
    if not isinstance(location, str) or "," not in location:
        return None
    parts = location.split(",")
    if len(parts) != 2:
        return None
    try:
        lng = float(parts[0].strip())
        lat = float(parts[1].strip())
    except ValueError:
        return None
    return lng, lat


def map_poi_to_result(poi: dict[str, Any]) -> PlaceSearchResult | None:
    """Convert one Amap POI dict into internal DTO; skip incomplete rows."""
    name = poi.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    coords = _parse_location(poi.get("location"))
    if coords is None:
        return None
    lng, lat = coords

    address = poi.get("address")
    if isinstance(address, list):
        address = " ".join(str(a) for a in address if a) or None
    elif address is not None:
        address = str(address) or None

    city_name = poi.get("cityname")
    if city_name is not None:
        city_name = str(city_name) or None

    district = poi.get("adname")
    if district is not None:
        district = str(district) or None

    poi_id = poi.get("id")
    amap_poi_id = str(poi_id) if poi_id else None

    return PlaceSearchResult(
        name=name.strip(),
        address=address,
        city_name=city_name,
        district=district,
        lng=lng,
        lat=lat,
        amap_poi_id=amap_poi_id,
    )


async def search_places(*, keyword: str, city: str, page: int = 1, offset: int = 20) -> list[PlaceSearchResult]:
    settings = get_settings()
    if not settings.amap_web_service_key.strip():
        raise AppError(
            ErrorCode.AMAP_SERVICE_ERROR,
            "未配置高德 Web 服务 Key，请在 server/.env 填写 AMAP_WEB_SERVICE_KEY",
            status_code=502,
        )

    params = {
        "key": settings.amap_web_service_key,
        "keywords": keyword.strip(),
        "city": city.strip(),
        "citylimit": "true",
        "offset": min(max(offset, 1), 25),
        "page": max(page, 1),
        "extensions": "base",
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, read=10.0)) as client:
            response = await client.get(settings.amap_place_text_url, params=params)
    except httpx.TimeoutException:
        logger.warning("Amap place search timeout")
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地点搜索超时", status_code=502) from None
    except httpx.HTTPError:
        logger.warning("Amap place search network error")
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地点搜索网络异常", status_code=502) from None

    if response.status_code >= 400:
        logger.warning("Amap place search HTTP %s", response.status_code)
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地点搜索请求失败", status_code=502)

    try:
        payload = response.json()
    except ValueError:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地点搜索响应无效", status_code=502) from None

    status = str(payload.get("status", ""))
    if status != "1":
        info = str(payload.get("info") or payload.get("infocode") or "unknown")
        logger.warning("Amap place search business failure info=%s", info)
        raise AppError(
            ErrorCode.AMAP_SERVICE_ERROR,
            "高德地点搜索失败",
            details={"amap_info": info},
            status_code=502,
        )

    pois = payload.get("pois") or []
    if not isinstance(pois, list):
        return []

    results: list[PlaceSearchResult] = []
    for poi in pois:
        if not isinstance(poi, dict):
            continue
        mapped = map_poi_to_result(poi)
        if mapped is not None:
            results.append(mapped)
    return results
