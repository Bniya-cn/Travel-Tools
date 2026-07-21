"""Route preview and segment persist API."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.errors import AppError, ErrorCode
from app.db.session import get_db
from app.models.route_segment import RouteSegment
from app.schemas.common import ApiResponse, ok
from app.schemas.routes import (
    RoutePreviewRequest,
    RoutePreviewResponse,
    RouteSegmentCreate,
    RouteSegmentResponse,
)
from app.services import auto_transport
from app.services.amap_routes import DEFAULT_TRANSIT_STRATEGY
from app.services.preview_token import issue_preview_token
from app.services.route_resolve import get_route_with_cache, resolve_endpoints

router = APIRouter(tags=["routes"])


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
    from app.models.itinerary_item import ItineraryItem

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
