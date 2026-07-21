"""Amap geocode — resolve city name to map center."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.schemas.geo import CityCenterResponse

logger = logging.getLogger("travel_planner.amap")


def _parse_location(location: Any) -> tuple[float, float] | None:
    if not isinstance(location, str) or "," not in location:
        return None
    parts = location.split(",")
    if len(parts) != 2:
        return None
    try:
        return float(parts[0].strip()), float(parts[1].strip())
    except ValueError:
        return None


async def geocode_city(city: str) -> CityCenterResponse:
    """Geocode a Chinese city name to lng/lat via Amap."""
    settings = get_settings()
    city_name = city.strip()
    if not city_name:
        raise AppError(ErrorCode.VALIDATION_ERROR, "城市名称不能为空", status_code=422)

    if not settings.amap_web_service_key.strip():
        raise AppError(
            ErrorCode.AMAP_SERVICE_ERROR,
            "未配置高德 Web 服务 Key，请在 server/.env 填写 AMAP_WEB_SERVICE_KEY",
            status_code=502,
        )

    params = {
        "key": settings.amap_web_service_key,
        "address": city_name,
        "city": city_name,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(settings.amap_geocode_url, params=params)
    except httpx.TimeoutException as exc:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地理编码超时", status_code=502) from exc
    except httpx.HTTPError as exc:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地理编码网络异常", status_code=502) from exc

    if response.status_code != 200:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地理编码请求失败", status_code=502)

    try:
        payload = response.json()
    except ValueError as exc:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地理编码响应无效", status_code=502) from exc

    if not isinstance(payload, dict):
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德地理编码响应无效", status_code=502)

    if str(payload.get("status")) != "1":
        info = str(payload.get("info") or "unknown")
        logger.warning("Amap geocode business failure info=%s", info)
        raise AppError(
            ErrorCode.AMAP_SERVICE_ERROR,
            "高德地理编码失败",
            status_code=502,
            details={"amap_info": info},
        )

    geocodes = payload.get("geocodes")
    if not isinstance(geocodes, list) or not geocodes:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "无法解析该城市坐标", status_code=502)

    first = geocodes[0]
    if not isinstance(first, dict):
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "无法解析该城市坐标", status_code=502)

    coords = _parse_location(first.get("location"))
    if coords is None:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "无法解析该城市坐标", status_code=502)

    lng, lat = coords
    return CityCenterResponse(city_name=city_name, lng=lng, lat=lat)
