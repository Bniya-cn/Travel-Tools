"""AI day planner — order + duration suggestions; nearest-neighbor fallback."""

from __future__ import annotations

import json
import logging
import math
import re
from datetime import datetime, time, timedelta
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.models.place import Place
from app.models.route_plan_draft import DraftSource
from app.models.trip import Trip
from app.schemas.route_plan_draft import AiPlanRequest, DraftStop, RoutePlanDraftResponse
from app.services import plan_draft_service

logger = logging.getLogger("travel_planner.ai_plan")


def _parse_hhmm(value: str) -> time:
    return time.fromisoformat(value)


def _add_minutes(t: time, minutes: int) -> time:
    base = datetime.combine(datetime.today().date(), t)
    return (base + timedelta(minutes=minutes)).time()


def _minutes_between(start: time, end: time) -> int:
    a = datetime.combine(datetime.today().date(), start)
    b = datetime.combine(datetime.today().date(), end)
    return max(0, int((b - a).total_seconds() // 60))


def _haversine_km(lng1: float, lat1: float, lng2: float, lat2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_neighbor_order(places: list[Place], start_lng: float, start_lat: float) -> list[Place]:
    remaining = list(places)
    ordered: list[Place] = []
    cur_lng, cur_lat = start_lng, start_lat
    while remaining:
        remaining.sort(
            key=lambda p: _haversine_km(cur_lng, cur_lat, float(p.lng), float(p.lat))
        )
        nxt = remaining.pop(0)
        ordered.append(nxt)
        cur_lng, cur_lat = float(nxt.lng), float(nxt.lat)
    return ordered


def build_stops_from_places(
    places: list[Place],
    *,
    day_start: str,
    day_end: str,
    preferred_duration: int | None = 90,
) -> list[DraftStop]:
    start = _parse_hhmm(day_start)
    end = _parse_hhmm(day_end)
    total_min = _minutes_between(start, end)
    n = len(places)
    if n == 0:
        return []
    # Reserve ~20 min transit buffer between stops
    buffer = 20 * max(0, n - 1)
    stay = preferred_duration or max(45, (total_min - buffer) // n)
    cursor = start
    stops: list[DraftStop] = []
    for idx, place in enumerate(places, start=1):
        stop_end = _add_minutes(cursor, stay)
        if stop_end > end or stop_end <= cursor:
            stop_end = end
        stops.append(
            DraftStop(
                place_id=place.id,
                title=f"游览{place.name}",
                start_time=cursor.strftime("%H:%M"),
                end_time=stop_end.strftime("%H:%M"),
                order=idx,
                preferred_duration_minutes=stay,
            )
        )
        cursor = _add_minutes(stop_end, 20)
        if cursor >= end:
            break
    return stops


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


async def _ai_order_places(
    *,
    city_name: str,
    places: list[Place],
    day_start: str,
    day_end: str,
    preferences: list[str],
) -> list[DraftStop] | None:
    settings = get_settings()
    base = settings.ai_api_base_url.strip().rstrip("/")
    key = settings.ai_api_key.strip()
    model = settings.ai_model.strip()
    if not base or not key or not model:
        return None

    catalog = [{"place_id": p.id, "name": p.name, "lng": float(p.lng), "lat": float(p.lat)} for p in places]
    prompt = (
        f"你是{city_name}一日游规划助手。根据地点列表规划访问顺序与停留时间，严格输出 JSON：\n"
        '{"stops":[{"place_id":"...","title":"...","start_time":"HH:MM","end_time":"HH:MM","order":1,'
        '"preferred_duration_minutes":90}]}\n'
        f"时间窗：{day_start}–{day_end}。偏好：{', '.join(preferences) or '无'}。\n"
        f"地点：{json.dumps(catalog, ensure_ascii=False)}\n"
        "要求：覆盖全部 place_id；时间不重叠且 end>start；只排顺序与停留，不算真实交通；只输出 JSON。"
    )
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                f"{base}/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": "你只输出合法 JSON 对象。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                },
            )
        if response.status_code != 200:
            logger.warning("AI plan HTTP %s", response.status_code)
            return None
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        parsed = _extract_json_object(content)
        if not parsed or not isinstance(parsed.get("stops"), list):
            return None
        stops = [DraftStop.model_validate(s) for s in parsed["stops"]]
        ids = {p.id for p in places}
        if {s.place_id for s in stops} != ids:
            return None
        return sorted(stops, key=lambda s: s.order)
    except Exception:
        logger.exception("AI plan failed")
        return None


async def create_ai_plan(db: Session, trip_id: str, payload: AiPlanRequest) -> RoutePlanDraftResponse:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    if payload.date < trip.start_date or payload.date > trip.end_date:
        raise AppError(ErrorCode.VALIDATION_ERROR, "日期必须在旅行范围内", status_code=422)

    places: list[Place] = []
    for pid in payload.place_ids:
        place = db.get(Place, pid)
        if place is None or place.trip_id != trip_id:
            raise AppError(ErrorCode.VALIDATION_ERROR, f"地点无效: {pid}", status_code=422)
        places.append(place)

    ai_stops = await _ai_order_places(
        city_name=trip.city_name,
        places=places,
        day_start=payload.day_start,
        day_end=payload.day_end,
        preferences=payload.preferences,
    )
    if ai_stops is not None:
        return plan_draft_service.create_draft_from_stops(
            db,
            trip_id=trip_id,
            day=payload.date,
            source=DraftSource.ai,
            stops=ai_stops,
        )

    # Fallback: nearest neighbor from first place (or mean center)
    start_lng = float(places[0].lng)
    start_lat = float(places[0].lat)
    ordered = nearest_neighbor_order(places[1:], start_lng, start_lat)
    ordered = [places[0]] + ordered
    stops = build_stops_from_places(
        ordered,
        day_start=payload.day_start,
        day_end=payload.day_end,
    )
    return plan_draft_service.create_draft_from_stops(
        db,
        trip_id=trip_id,
        day=payload.date,
        source=DraftSource.ai,  # still labeled ai path entry; source could be manual for pure fallback
        stops=stops,
    )
