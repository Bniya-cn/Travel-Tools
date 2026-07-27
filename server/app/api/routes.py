"""Route preview and segment persist API."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ErrorCode
from app.db.session import get_db
from app.models.itinerary_item import ItineraryItem
from app.models.route_segment import RouteSegment
from app.models.trip import Trip
from app.schemas.common import ApiResponse, ok
from app.schemas.routes import (
    RoutePreviewRequest,
    RoutePreviewResponse,
    RouteSegmentCreate,
    RouteSegmentResponse,
    RouteStepDTO,
)
from app.services import auto_transport
from app.services.amap_routes import DEFAULT_TRANSIT_STRATEGY, simplify_route_steps
from app.services.preview_token import issue_preview_token
from app.services.route_resolve import get_route_with_cache, resolve_endpoints

router = APIRouter(tags=["routes"])


def _get_trip_or_404(db: Session, trip_id: str) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    return trip


async def _preview(
    db: Session,
    payload: RoutePreviewRequest,
    *,
    route_type: str,
) -> RoutePreviewResponse:
    endpoints = resolve_endpoints(
        db,
        after_item_id=payload.after_item_id,
        before_item_id=payload.before_item_id,
    )
    if route_type == "transit":
        strategy = payload.strategy if payload.strategy is not None else DEFAULT_TRANSIT_STRATEGY
    else:
        strategy = payload.strategy if payload.strategy is not None else 0

    route, cache_hit = await get_route_with_cache(
        db, endpoints, route_type=route_type, strategy=strategy
    )
    token = issue_preview_token(
        trip_id=endpoints.trip.id,
        after_item_id=payload.after_item_id,
        before_item_id=payload.before_item_id,
        route_type=route_type,
        strategy=strategy,
        route=route,
    )
    return RoutePreviewResponse(route=route, cache_hit=cache_hit, preview_token=token)


@router.post("/api/routes/transit/preview", response_model=ApiResponse[RoutePreviewResponse])
async def preview_transit(
    payload: RoutePreviewRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[RoutePreviewResponse]:
    return ok(await _preview(db, payload, route_type="transit"))


@router.post("/api/routes/walking/preview", response_model=ApiResponse[RoutePreviewResponse])
async def preview_walking(
    payload: RoutePreviewRequest,
    db: Session = Depends(get_db),
) -> ApiResponse[RoutePreviewResponse]:
    return ok(await _preview(db, payload, route_type="walking"))


@router.get(
    "/api/trips/{trip_id}/route-segments",
    response_model=ApiResponse[list[RouteSegmentResponse]],
)
def list_trip_segments(
    trip_id: str,
    date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ApiResponse[list[RouteSegmentResponse]]:
    """按旅行（可选日期）列出已保存路线段，含 polyline / steps。"""
    _get_trip_or_404(db, trip_id)
    stmt = (
        select(RouteSegment)
        .options(selectinload(RouteSegment.transport_item))
        .where(RouteSegment.trip_id == trip_id)
    )
    if date is not None:
        stmt = stmt.join(ItineraryItem, RouteSegment.transport_item_id == ItineraryItem.id).where(
            ItineraryItem.date == date
        )
    segments = db.scalars(stmt.order_by(RouteSegment.created_at.asc())).all()

    responses: list[RouteSegmentResponse] = []
    for seg in segments:
        resp = RouteSegmentResponse.model_validate(seg)
        raw_steps = seg.steps_json or []
        parsed: list[RouteStepDTO] = []
        for raw in raw_steps:
            if isinstance(raw, dict):
                try:
                    parsed.append(RouteStepDTO.model_validate(raw))
                except Exception:
                    continue
        simplified = [s.model_dump(mode="json") for s in simplify_route_steps(parsed)]
        resp = resp.model_copy(update={"steps_json": simplified})
        responses.append(resp)
    return ok(responses)


@router.post(
    "/api/routes/segments",
    response_model=ApiResponse[RouteSegmentResponse],
    status_code=201,
)
async def create_segment(
    payload: RouteSegmentCreate,
    db: Session = Depends(get_db),
) -> ApiResponse[RouteSegmentResponse]:
    segment = await auto_transport.persist_route_segment(
        db,
        after_item_id=payload.after_item_id,
        before_item_id=payload.before_item_id,
        route_type=payload.route_type,
        strategy=payload.strategy,
        preview_token=payload.preview_token,
    )
    return ok(segment)


@router.delete("/api/routes/segments/{segment_id}", response_model=ApiResponse[dict])
def delete_segment(segment_id: str, db: Session = Depends(get_db)) -> ApiResponse[dict]:
    segment = db.get(RouteSegment, segment_id)
    if segment is None:
        raise AppError(ErrorCode.NOT_FOUND, "路线段不存在", status_code=404)

    transport_item = db.get(ItineraryItem, segment.transport_item_id)
    trip_id = segment.trip_id
    day = transport_item.date if transport_item is not None else None

    auto_transport.delete_segment_and_transport(db, segment)
    if day is not None:
        auto_transport.reorder_day_sort_order(db, trip_id, day)
    db.commit()
    return ok({"ok": True})
