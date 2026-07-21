"""Trip CRUD API."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ErrorCode
from app.db.session import get_db
from app.models.itinerary_item import ItineraryItem
from app.models.trip import Trip
from app.schemas.common import ApiResponse, ok
from app.schemas.trip import TripCreate, TripResponse, TripUpdate
from app.utils.datetime import utc_now

router = APIRouter(prefix="/api/trips", tags=["trips"])


def _to_response(trip: Trip, items_count: int | None = None) -> TripResponse:
    data = TripResponse.model_validate(trip)
    if items_count is not None:
        data.items_count = items_count
    return data


@router.post("", response_model=ApiResponse[TripResponse], status_code=201)
def create_trip(payload: TripCreate, db: Session = Depends(get_db)) -> ApiResponse[TripResponse]:
    trip = Trip(
        name=payload.name,
        city_name=payload.city_name,
        city_code=payload.city_code,
        timezone=payload.timezone,
        start_date=payload.start_date,
        end_date=payload.end_date,
        notes=payload.notes,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return ok(_to_response(trip, items_count=0))


@router.get("", response_model=ApiResponse[list[TripResponse]])
def list_trips(db: Session = Depends(get_db)) -> ApiResponse[list[TripResponse]]:
    trips = db.scalars(select(Trip).order_by(Trip.start_date.desc(), Trip.created_at.desc())).all()
    counts = dict(
        db.execute(
            select(ItineraryItem.trip_id, func.count())
            .group_by(ItineraryItem.trip_id)
        ).all()
    )
    return ok([_to_response(t, items_count=int(counts.get(t.id, 0))) for t in trips])


@router.get("/{trip_id}", response_model=ApiResponse[TripResponse])
def get_trip(trip_id: str, db: Session = Depends(get_db)) -> ApiResponse[TripResponse]:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    count = db.scalar(
        select(func.count()).select_from(ItineraryItem).where(ItineraryItem.trip_id == trip_id)
    )
    return ok(_to_response(trip, items_count=int(count or 0)))


@router.patch("/{trip_id}", response_model=ApiResponse[TripResponse])
def update_trip(
    trip_id: str,
    payload: TripUpdate,
    db: Session = Depends(get_db),
) -> ApiResponse[TripResponse]:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)

    data = payload.model_dump(exclude_unset=True)
    new_start = data.get("start_date", trip.start_date)
    new_end = data.get("end_date", trip.end_date)
    if new_end < new_start:
        raise AppError(ErrorCode.VALIDATION_ERROR, "end_date 必须大于或等于 start_date", status_code=422)

    if "start_date" in data or "end_date" in data:
        outside = db.scalar(
            select(func.count())
            .select_from(ItineraryItem)
            .where(
                ItineraryItem.trip_id == trip_id,
                (ItineraryItem.date < new_start) | (ItineraryItem.date > new_end),
            )
        )
        if outside:
            raise AppError(
                ErrorCode.TRIP_DATE_RANGE_HAS_ITEMS,
                "缩短旅行日期失败：仍有事项落在新范围之外",
                details={"outside_item_count": int(outside)},
                status_code=409,
            )

    for key, value in data.items():
        setattr(trip, key, value)
    trip.updated_at = utc_now()
    db.commit()
    db.refresh(trip)
    count = db.scalar(
        select(func.count()).select_from(ItineraryItem).where(ItineraryItem.trip_id == trip_id)
    )
    return ok(_to_response(trip, items_count=int(count or 0)))


@router.delete("/{trip_id}", response_model=ApiResponse[dict])
def delete_trip(trip_id: str, db: Session = Depends(get_db)) -> ApiResponse[dict]:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    db.delete(trip)
    db.commit()
    return ok({"ok": True})
