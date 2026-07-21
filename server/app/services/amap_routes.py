"""Amap transit / walking adapters — return RouteDTO only, never raw Amap JSON."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.schemas.routes import RouteDTO, RouteStepDTO

logger = logging.getLogger("travel_planner.amap")

PROVIDER = "amap"
PROVIDER_VERSION = "v5"
DEFAULT_TRANSIT_STRATEGY = 7


def _require_key() -> str:
    key = get_settings().amap_web_service_key.strip()
    if not key:
        raise AppError(
            ErrorCode.AMAP_SERVICE_ERROR,
            "未配置高德 Web 服务 Key，请在 server/.env 填写 AMAP_WEB_SERVICE_KEY",
            status_code=502,
        )
    return key


async def _get_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(5.0, read=15.0)) as client:
            response = await client.get(url, params=params)
    except httpx.TimeoutException:
        logger.warning("Amap route timeout")
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德路线请求超时", status_code=502) from None
    except httpx.HTTPError:
        logger.warning("Amap route network error")
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德路线网络异常", status_code=502) from None

    if response.status_code >= 400:
        logger.warning("Amap route HTTP %s", response.status_code)
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德路线请求失败", status_code=502)

    try:
        payload = response.json()
    except ValueError:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德路线响应无效", status_code=502) from None

    if not isinstance(payload, dict):
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德路线响应无效", status_code=502)

    status = str(payload.get("status", ""))
    if status != "1":
        info = str(payload.get("info") or payload.get("infocode") or "unknown")
        logger.warning("Amap route business failure info=%s", info)
        raise AppError(
            ErrorCode.AMAP_SERVICE_ERROR,
            "高德路线查询失败",
            details={"amap_info": info},
            status_code=502,
        )
    return payload


def parse_polyline(raw: Any) -> list[list[float]]:
    """Parse Amap polyline string 'lng,lat;lng,lat' into [[lng,lat],...]."""
    if not isinstance(raw, str) or not raw.strip():
        return []
    points: list[list[float]] = []
    for part in raw.split(";"):
        part = part.strip()
        if not part or "," not in part:
            continue
        a, b = part.split(",", 1)
        try:
            points.append([float(a.strip()), float(b.strip())])
        except ValueError:
            continue
    return points


def _safe_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def map_transit_payload(payload: dict[str, Any], *, strategy: int) -> RouteDTO:
    route = payload.get("route") or {}
    transits = route.get("transits") or []
    if not isinstance(transits, list) or not transits:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德未返回公交路线", status_code=502)

    best = transits[0]
    if not isinstance(best, dict):
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德公交路线无效", status_code=502)

    duration = _safe_int(best.get("duration"))
    if duration is None or duration <= 0:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德公交缺少 duration", status_code=502)

    distance = _safe_int(best.get("distance")) or 0
    walking = _safe_int(best.get("walking_distance"))
    segments = best.get("segments") or []
    transfer_count = 0
    polyline: list[list[float]] = []
    steps: list[RouteStepDTO] = []

    if isinstance(segments, list):
        transit_legs = 0
        for seg in segments:
            if not isinstance(seg, dict):
                continue
            walking_seg = seg.get("walking") or {}
            if isinstance(walking_seg, dict):
                for step in walking_seg.get("steps") or []:
                    if not isinstance(step, dict):
                        continue
                    polyline.extend(parse_polyline(step.get("polyline")))
                    steps.append(
                        RouteStepDTO(
                            instruction=str(step.get("instruction") or "") or None,
                            distance_meters=_safe_int(step.get("distance")),
                            duration_seconds=_safe_int(step.get("duration")),
                            mode="walking",
                        )
                    )
            bus = seg.get("bus") or {}
            buslines = bus.get("buslines") if isinstance(bus, dict) else None
            if isinstance(buslines, list):
                for line in buslines:
                    if not isinstance(line, dict):
                        continue
                    transit_legs += 1
                    polyline.extend(parse_polyline(line.get("polyline")))
                    name = line.get("name") or line.get("type")
                    steps.append(
                        RouteStepDTO(
                            instruction=str(name) if name else None,
                            distance_meters=_safe_int(line.get("distance")),
                            duration_seconds=_safe_int(line.get("duration")),
                            mode="transit",
                        )
                    )
        transfer_count = max(transit_legs - 1, 0)

    if not polyline:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德公交缺少 polyline", status_code=502)

    return RouteDTO(
        route_type="transit",
        strategy=strategy,
        duration_seconds=duration,
        distance_meters=distance,
        walking_distance_meters=walking,
        transfer_count=transfer_count,
        polyline=polyline,
        steps=steps,
        provider=PROVIDER,
        provider_version=PROVIDER_VERSION,
    )


def map_walking_payload(payload: dict[str, Any]) -> RouteDTO:
    route = payload.get("route") or {}
    paths = route.get("paths") or []
    if not isinstance(paths, list) or not paths:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德未返回步行路线", status_code=502)
    best = paths[0]
    if not isinstance(best, dict):
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德步行路线无效", status_code=502)

    duration = _safe_int(best.get("duration"))
    if duration is None or duration <= 0:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德步行缺少 duration", status_code=502)

    distance = _safe_int(best.get("distance")) or 0
    polyline: list[list[float]] = []
    steps: list[RouteStepDTO] = []
    for step in best.get("steps") or []:
        if not isinstance(step, dict):
            continue
        polyline.extend(parse_polyline(step.get("polyline")))
        steps.append(
            RouteStepDTO(
                instruction=str(step.get("instruction") or "") or None,
                distance_meters=_safe_int(step.get("distance")),
                duration_seconds=_safe_int(step.get("duration")),
                mode="walking",
            )
        )

    if not polyline:
        # some responses put polyline on path
        polyline = parse_polyline(best.get("polyline"))
    if not polyline:
        raise AppError(ErrorCode.AMAP_SERVICE_ERROR, "高德步行缺少 polyline", status_code=502)

    return RouteDTO(
        route_type="walking",
        strategy=0,
        duration_seconds=duration,
        distance_meters=distance,
        walking_distance_meters=distance,
        transfer_count=0,
        polyline=polyline,
        steps=steps,
        provider=PROVIDER,
        provider_version=PROVIDER_VERSION,
    )


async def fetch_transit_route(
    *,
    origin_lng: float,
    origin_lat: float,
    dest_lng: float,
    dest_lat: float,
    city_name: str,
    strategy: int = DEFAULT_TRANSIT_STRATEGY,
    nightflag: bool = False,
) -> RouteDTO:
    settings = get_settings()
    key = _require_key()
    city = city_name.strip()
    if not city:
        raise AppError(ErrorCode.VALIDATION_ERROR, "旅行城市名称不能为空", status_code=422)

    params = {
        "key": key,
        "origin": f"{origin_lng:.6f},{origin_lat:.6f}",
        "destination": f"{dest_lng:.6f},{dest_lat:.6f}",
        "city": city,
        "cityd": city,
        "strategy": strategy,
        "AlternativeRoute": 1,
        "nightflag": 1 if nightflag else 0,
        # Request cost / navi / polyline extensions where supported
        "extensions": "all",
    }
    payload = await _get_json(settings.amap_transit_url, params)
    return map_transit_payload(payload, strategy=strategy)


async def fetch_walking_route(
    *,
    origin_lng: float,
    origin_lat: float,
    dest_lng: float,
    dest_lat: float,
) -> RouteDTO:
    settings = get_settings()
    key = _require_key()
    params = {
        "key": key,
        "origin": f"{origin_lng:.6f},{origin_lat:.6f}",
        "destination": f"{dest_lng:.6f},{dest_lat:.6f}",
    }
    payload = await _get_json(settings.amap_walking_url, params)
    return map_walking_payload(payload)
