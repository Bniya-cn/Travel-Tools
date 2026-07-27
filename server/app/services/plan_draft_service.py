"""Route plan draft: upsert, generate multi-leg routes, confirm to Items/Segments."""

from __future__ import annotations

from datetime import datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ErrorCode
from app.models.itinerary_item import ItemCategory, ItemKind, ItineraryItem
from app.models.place import Place
from app.models.route_plan_draft import DraftSource, DraftStatus, RoutePlanDraft
from app.models.trip import Trip
from app.models.trip_place import TripPlace, TripPlaceStatus
from app.schemas.route_plan_draft import (
    ConfirmDraftResponse,
    DraftRouteSegmentPreview,
    DraftStop,
    GenerateRoutesResponse,
    RoutePlanDraftResponse,
    RoutePlanDraftUpsert,
)
from app.services import auto_transport
from app.services.amap_routes import DEFAULT_TRANSIT_STRATEGY
from app.services.preview_token import issue_preview_token
from app.services.route_resolve import get_route_for_place_pair, get_route_with_cache, resolve_place_pair
from app.utils.datetime import utc_now


def _get_trip(db: Session, trip_id: str) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    return trip


def _cancel_active_drafts(db: Session, trip_id: str, day) -> None:
    rows = db.scalars(
        select(RoutePlanDraft).where(
            RoutePlanDraft.trip_id == trip_id,
            RoutePlanDraft.date == day,
            RoutePlanDraft.status == DraftStatus.draft,
        )
    ).all()
    for row in rows:
        row.status = DraftStatus.cancelled
        row.updated_at = utc_now()


def get_active_draft(db: Session, trip_id: str, day) -> RoutePlanDraft | None:
    return db.scalar(
        select(RoutePlanDraft)
        .where(
            RoutePlanDraft.trip_id == trip_id,
            RoutePlanDraft.date == day,
            RoutePlanDraft.status == DraftStatus.draft,
        )
        .order_by(RoutePlanDraft.updated_at.desc())
    )


def get_draft_or_404(db: Session, trip_id: str, draft_id: str) -> RoutePlanDraft:
    draft = db.get(RoutePlanDraft, draft_id)
    if draft is None or draft.trip_id != trip_id:
        raise AppError(ErrorCode.NOT_FOUND, "规划草稿不存在", status_code=404)
    return draft


def upsert_draft(db: Session, trip_id: str, payload: RoutePlanDraftUpsert) -> RoutePlanDraftResponse:
    trip = _get_trip(db, trip_id)
    if payload.date < trip.start_date or payload.date > trip.end_date:
        raise AppError(ErrorCode.VALIDATION_ERROR, "日期必须在旅行范围内", status_code=422)

    place_ids = [s.place_id for s in payload.stops]
    for pid in place_ids:
        place = db.get(Place, pid)
        if place is None or place.trip_id != trip_id:
            raise AppError(ErrorCode.VALIDATION_ERROR, f"地点无效: {pid}", status_code=422)

    # Mark selected trip places
    if place_ids:
        tps = db.scalars(
            select(TripPlace).where(
                TripPlace.trip_id == trip_id,
                TripPlace.place_id.in_(place_ids),
                TripPlace.status != TripPlaceStatus.removed,
            )
        ).all()
        for tp in tps:
            if tp.status == TripPlaceStatus.candidate:
                tp.status = TripPlaceStatus.selected
                tp.updated_at = utc_now()

    existing = get_active_draft(db, trip_id, payload.date)
    stops_payload = [s.model_dump(mode="json") for s in payload.stops]
    if existing is None:
        draft = RoutePlanDraft(
            trip_id=trip_id,
            date=payload.date,
            source=payload.source,
            stops_json=stops_payload,
            status=DraftStatus.draft,
        )
        db.add(draft)
    else:
        if existing.status != DraftStatus.draft:
            raise AppError(ErrorCode.CONFLICT, "当前草稿不可修改", status_code=409)
        existing.source = payload.source
        existing.stops_json = stops_payload
        existing.updated_at = utc_now()
        draft = existing

    db.commit()
    db.refresh(draft)
    return RoutePlanDraftResponse.from_orm_draft(draft)


def get_draft_for_date(db: Session, trip_id: str, day) -> RoutePlanDraftResponse | None:
    _get_trip(db, trip_id)
    draft = get_active_draft(db, trip_id, day)
    if draft is None:
        return None
    return RoutePlanDraftResponse.from_orm_draft(draft)


def _parse_hhmm(value: str) -> time:
    return time.fromisoformat(value)


def _seconds_between(start: time, end: time) -> int:
    a = datetime.combine(datetime.today().date(), start)
    b = datetime.combine(datetime.today().date(), end)
    return int((b - a).total_seconds())


async def generate_routes(
    db: Session,
    trip_id: str,
    draft_id: str,
    *,
    route_type: str = "transit",
    strategy: int | None = None,
) -> GenerateRoutesResponse:
    draft = get_draft_or_404(db, trip_id, draft_id)
    if draft.status != DraftStatus.draft:
        raise AppError(ErrorCode.VALIDATION_ERROR, "仅 draft 状态可生成路线", status_code=422)

    stops = [DraftStop.model_validate(s) for s in (draft.stops_json or [])]
    stops = sorted(stops, key=lambda s: s.order)
    if len(stops) < 2:
        raise AppError(ErrorCode.VALIDATION_ERROR, "至少需要 2 个停靠点", status_code=422)
    for s in stops:
        if not s.start_time or not s.end_time:
            raise AppError(ErrorCode.VALIDATION_ERROR, "所有停靠点必须设置开始与结束时间", status_code=422)

    strat = strategy if strategy is not None else (
        DEFAULT_TRANSIT_STRATEGY if route_type == "transit" else 0
    )
    segments: list[DraftRouteSegmentPreview] = []

    for i in range(len(stops) - 1):
        a, b = stops[i], stops[i + 1]
        depart = _parse_hhmm(a.end_time)  # type: ignore[arg-type]
        arrive_limit = _parse_hhmm(b.start_time)  # type: ignore[arg-type]
        if depart >= arrive_limit:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                f"停靠点 {a.order} 结束时间必须早于 {b.order} 开始时间",
                status_code=422,
            )

        endpoints = resolve_place_pair(
            db,
            trip_id=trip_id,
            origin_place_id=a.place_id,
            destination_place_id=b.place_id,
            route_date=draft.date,
            depart_time=depart,
        )
        route, cache_hit = await get_route_for_place_pair(
            db, endpoints, route_type=route_type, strategy=strat
        )
        available = _seconds_between(depart, arrive_limit)
        conflict = route.duration_seconds > available
        # Placeholder item ids in token — confirm re-issues after creating real items
        token = issue_preview_token(
            trip_id=trip_id,
            after_item_id=f"draft:{a.place_id}",
            before_item_id=f"draft:{b.place_id}",
            route_type=route_type,
            strategy=strat,
            route=route,
        )
        segments.append(
            DraftRouteSegmentPreview(
                from_place_id=a.place_id,
                to_place_id=b.place_id,
                from_order=a.order,
                to_order=b.order,
                route=route,
                preview_token=token,
                cache_hit=cache_hit,
                time_conflict=conflict,
                available_duration_seconds=available,
            )
        )

    return GenerateRoutesResponse(draft_id=draft.id, segments=segments)


async def confirm_draft(
    db: Session,
    trip_id: str,
    draft_id: str,
    *,
    route_type: str = "transit",
    strategy: int | None = None,
) -> ConfirmDraftResponse:
    draft = get_draft_or_404(db, trip_id, draft_id)
    if draft.status != DraftStatus.draft:
        raise AppError(ErrorCode.VALIDATION_ERROR, "仅 draft 状态可确认", status_code=422)

    stops = sorted([DraftStop.model_validate(s) for s in (draft.stops_json or [])], key=lambda s: s.order)
    if len(stops) < 1:
        raise AppError(ErrorCode.VALIDATION_ERROR, "草稿没有停靠点", status_code=422)
    for s in stops:
        if not s.start_time or not s.end_time:
            raise AppError(ErrorCode.VALIDATION_ERROR, "所有停靠点必须设置时间后再保存", status_code=422)

    # Create activity items
    place_to_item: dict[str, ItineraryItem] = {}
    item_ids: list[str] = []
    for s in stops:
        item = ItineraryItem(
            trip_id=trip_id,
            place_id=s.place_id,
            date=draft.date,
            start_time=_parse_hhmm(s.start_time),
            end_time=_parse_hhmm(s.end_time),
            is_all_day=False,
            kind=ItemKind.activity,
            category=ItemCategory.place,
            title=s.title,
            description=None,
            sort_order=s.order,
        )
        db.add(item)
        db.flush()
        place_to_item[s.place_id] = item
        item_ids.append(item.id)

    strat = strategy if strategy is not None else (
        DEFAULT_TRANSIT_STRATEGY if route_type == "transit" else 0
    )
    segment_ids: list[str] = []

    # Persist routes between consecutive stops (uses cache from generate-routes when available)
    for i in range(len(stops) - 1):
        a, b = stops[i], stops[i + 1]
        after = place_to_item[a.place_id]
        before = place_to_item[b.place_id]
        from app.services.route_resolve import resolve_endpoints

        endpoints = resolve_endpoints(db, after_item_id=after.id, before_item_id=before.id)
        route, _hit = await get_route_with_cache(db, endpoints, route_type=route_type, strategy=strat)
        token = issue_preview_token(
            trip_id=trip_id,
            after_item_id=after.id,
            before_item_id=before.id,
            route_type=route_type,
            strategy=strat,
            route=route,
        )
        # persist_route_segment commits — so we need a version that doesn't commit mid-loop
        # Use internal write then single commit at end: call persist which commits each time.
        seg = await auto_transport.persist_route_segment(
            db,
            after_item_id=after.id,
            before_item_id=before.id,
            route_type=route_type,
            strategy=strat,
            preview_token=token,
        )
        segment_ids.append(seg.id)

    # Mark trip places planned
    planned_ids = [s.place_id for s in stops]
    tps = db.scalars(
        select(TripPlace).where(TripPlace.trip_id == trip_id, TripPlace.place_id.in_(planned_ids))
    ).all()
    for tp in tps:
        tp.status = TripPlaceStatus.planned
        tp.updated_at = utc_now()

    draft.status = DraftStatus.confirmed
    draft.updated_at = utc_now()
    db.commit()
    db.refresh(draft)

    return ConfirmDraftResponse(
        draft=RoutePlanDraftResponse.from_orm_draft(draft),
        item_ids=item_ids,
        segment_ids=segment_ids,
    )


def create_draft_from_stops(
    db: Session,
    *,
    trip_id: str,
    day,
    source: DraftSource,
    stops: list[DraftStop],
) -> RoutePlanDraftResponse:
    """Replace active draft with a new one (AI / fallback)."""
    _get_trip(db, trip_id)
    _cancel_active_drafts(db, trip_id, day)
    draft = RoutePlanDraft(
        trip_id=trip_id,
        date=day,
        source=source,
        stops_json=[s.model_dump(mode="json") for s in stops],
        status=DraftStatus.draft,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return RoutePlanDraftResponse.from_orm_draft(draft)
