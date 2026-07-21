"""Itinerary item API."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, ErrorCode
from app.db.session import get_db
from app.models.itinerary_item import ItineraryItem
from app.models.place import Place
from app.models.trip import Trip
from app.schemas.common import ApiResponse, ok
from app.schemas.itinerary import ItineraryItemCreate, ItineraryItemResponse, ItineraryItemUpdate
from app.services.conflict import check_time_conflict
from app.services.item_rules import ensure_date_in_trip_range, validate_item_fields
from app.services import auto_transport
from app.utils.datetime import utc_now

router = APIRouter(tags=["items"])


def _get_trip_or_404(db: Session, trip_id: str) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    return trip


def _get_item_or_404(db: Session, item_id: str) -> ItineraryItem:
    item = db.scalar(
        select(ItineraryItem)
        .options(selectinload(ItineraryItem.place))
        .where(ItineraryItem.id == item_id)
    )
    if item is None:
        raise AppError(ErrorCode.NOT_FOUND, "事项不存在", status_code=404)
    return item


def _resolve_place_for_trip(db: Session, trip_id: str, place_id: str | None) -> str | None:
    if place_id is None:
        return None
    place = db.get(Place, place_id)
    if place is None:
        raise AppError(ErrorCode.NOT_FOUND, "地点不存在", status_code=404)
    if place.trip_id != trip_id:
        raise AppError(
            ErrorCode.PLACE_TRIP_MISMATCH,
            "地点不属于当前旅行",
            details={"place_id": place_id, "trip_id": trip_id},
            status_code=422,
        )
    return place_id


def _day_items(db: Session, trip_id: str, day: date) -> list[ItineraryItem]:
    return list(
        db.scalars(
            select(ItineraryItem)
            .where(ItineraryItem.trip_id == trip_id, ItineraryItem.date == day)
            .order_by(ItineraryItem.sort_order.asc(), ItineraryItem.start_time.asc().nulls_first())
        ).all()
    )


def _item_response(item: ItineraryItem) -> ItineraryItemResponse:
    return ItineraryItemResponse.model_validate(item)


@router.post(
    "/api/trips/{trip_id}/items",
    response_model=ApiResponse[ItineraryItemResponse],
    status_code=201,
)
def create_item(
    trip_id: str,
    payload: ItineraryItemCreate,
    db: Session = Depends(get_db),
) -> ApiResponse[ItineraryItemResponse]:
    trip = _get_trip_or_404(db, trip_id)
    ensure_date_in_trip_range(payload.date, trip.start_date, trip.end_date)
    validate_item_fields(
        is_all_day=payload.is_all_day,
        start_time=payload.start_time,
        end_time=payload.end_time,
        kind=payload.kind,
        category=payload.category,
    )
    place_id = _resolve_place_for_trip(db, trip_id, payload.place_id)

    existing = _day_items(db, trip_id, payload.date)
    if not payload.is_all_day and payload.start_time and payload.end_time:
        conflict = check_time_conflict(
            start_time=payload.start_time,
            end_time=payload.end_time,
            existing_items=existing,
        )
        if conflict is not None:
            raise AppError(
                ErrorCode.ITEM_TIME_CONFLICT,
                "该时间段与已有事项冲突",
                details={"conflict_item_id": conflict.id, "conflict_title": conflict.title},
                status_code=409,
            )

    item = ItineraryItem(
        trip_id=trip_id,
        place_id=place_id,
        date=payload.date,
        start_time=None if payload.is_all_day else payload.start_time,
        end_time=None if payload.is_all_day else payload.end_time,
        is_all_day=payload.is_all_day,
        kind=payload.kind,
        category=payload.category,
        title=payload.title,
        description=payload.description,
        sort_order=payload.sort_order,
    )
    db.add(item)
    db.commit()
    item = _get_item_or_404(db, item.id)
    return ok(_item_response(item))


@router.get("/api/trips/{trip_id}/items", response_model=ApiResponse[list[ItineraryItemResponse]])
def list_items(
    trip_id: str,
    date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> ApiResponse[list[ItineraryItemResponse]]:
    _get_trip_or_404(db, trip_id)
    stmt = (
        select(ItineraryItem)
        .options(selectinload(ItineraryItem.place))
        .where(ItineraryItem.trip_id == trip_id)
    )
    if date is not None:
        stmt = stmt.where(ItineraryItem.date == date)
    stmt = stmt.order_by(
        ItineraryItem.date.asc(),
        ItineraryItem.sort_order.asc(),
        ItineraryItem.start_time.asc().nulls_first(),
    )
    items = db.scalars(stmt).all()
    return ok([_item_response(i) for i in items])


@router.patch("/api/items/{item_id}", response_model=ApiResponse[ItineraryItemResponse])
def update_item(
    item_id: str,
    payload: ItineraryItemUpdate,
    db: Session = Depends(get_db),
) -> ApiResponse[ItineraryItemResponse]:
    item = _get_item_or_404(db, item_id)
    trip = _get_trip_or_404(db, item.trip_id)
    data = payload.model_dump(exclude_unset=True)

    next_date = data.get("date", item.date)
    next_all_day = data.get("is_all_day", item.is_all_day)
    next_kind = data.get("kind", item.kind)
    next_category = data["category"] if "category" in data else item.category
    next_place_id = data["place_id"] if "place_id" in data else item.place_id

    if next_all_day:
        next_start = None
        next_end = None
    else:
        next_start = data["start_time"] if "start_time" in data else item.start_time
        next_end = data["end_time"] if "end_time" in data else item.end_time

    ensure_date_in_trip_range(next_date, trip.start_date, trip.end_date)
    validate_item_fields(
        is_all_day=next_all_day,
        start_time=next_start,
        end_time=next_end,
        kind=next_kind,
        category=next_category,
    )
    next_place_id = _resolve_place_for_trip(db, item.trip_id, next_place_id)

    # Invalidate auto-transport when place or times change.
    invalidate = (
        next_place_id != item.place_id
        or next_start != item.start_time
        or next_end != item.end_time
        or next_date != item.date
    )
    if invalidate:
        auto_transport.cleanup_segments_for_item(db, item.id)

    if not next_all_day and next_start and next_end:
        existing = _day_items(db, item.trip_id, next_date)
        conflict = check_time_conflict(
            start_time=next_start,
            end_time=next_end,
            existing_items=existing,
            exclude_item_id=item.id,
        )
        if conflict is not None:
            raise AppError(
                ErrorCode.ITEM_TIME_CONFLICT,
                "该时间段与已有事项冲突",
                details={"conflict_item_id": conflict.id, "conflict_title": conflict.title},
                status_code=409,
            )

    for key, value in data.items():
        if key == "place_id":
            continue
        setattr(item, key, value)
    item.is_all_day = next_all_day
    item.start_time = next_start
    item.end_time = next_end
    item.kind = next_kind
    item.category = next_category
    item.place_id = next_place_id
    item.updated_at = utc_now()
    db.commit()
    item = _get_item_or_404(db, item.id)
    return ok(_item_response(item))


@router.delete("/api/items/{item_id}", response_model=ApiResponse[dict])
def delete_item(item_id: str, db: Session = Depends(get_db)) -> ApiResponse[dict]:
    item = _get_item_or_404(db, item_id)
    # Explicit cleanup before deleting item (transport FK is RESTRICT).
    auto_transport.cleanup_segments_for_item(db, item.id)
    db.delete(item)
    db.commit()
    return ok({"ok": True})
