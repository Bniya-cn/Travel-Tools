"""TripPlace pool service."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import AppError, ErrorCode
from app.models.place import Place
from app.models.trip import Trip
from app.models.trip_place import TripPlace, TripPlaceStatus
from app.schemas.trip_place import TripPlaceCreate, TripPlaceResponse, TripPlaceUpdate
from app.utils.datetime import utc_now


def _get_trip(db: Session, trip_id: str) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    return trip


def list_trip_places(db: Session, trip_id: str, *, include_removed: bool = False) -> list[TripPlaceResponse]:
    _get_trip(db, trip_id)
    stmt = (
        select(TripPlace)
        .where(TripPlace.trip_id == trip_id)
        .options(joinedload(TripPlace.place))
        .order_by(TripPlace.order_index.asc(), TripPlace.created_at.asc())
    )
    if not include_removed:
        stmt = stmt.where(TripPlace.status != TripPlaceStatus.removed)
    rows = db.scalars(stmt).unique().all()
    return [TripPlaceResponse.model_validate(r) for r in rows]


def add_trip_place(db: Session, trip_id: str, payload: TripPlaceCreate) -> TripPlaceResponse:
    _get_trip(db, trip_id)
    place = db.get(Place, payload.place_id)
    if place is None or place.trip_id != trip_id:
        raise AppError(ErrorCode.NOT_FOUND, "地点不存在或不属于该旅行", status_code=404)

    existing = db.scalar(
        select(TripPlace).where(TripPlace.trip_id == trip_id, TripPlace.place_id == payload.place_id)
    )
    if existing is not None:
        if existing.status == TripPlaceStatus.removed:
            existing.status = TripPlaceStatus.candidate
            existing.preferred_duration = payload.preferred_duration
            existing.notes = payload.notes
            existing.updated_at = utc_now()
            db.commit()
            existing = db.scalar(
                select(TripPlace)
                .where(TripPlace.id == existing.id)
                .options(joinedload(TripPlace.place))
            )
            return TripPlaceResponse.model_validate(existing)
        # 幂等：已在池中直接返回
        existing = db.scalar(
            select(TripPlace)
            .where(TripPlace.id == existing.id)
            .options(joinedload(TripPlace.place))
        )
        return TripPlaceResponse.model_validate(existing)

    max_idx = db.scalar(
        select(func.coalesce(func.max(TripPlace.order_index), -1)).where(TripPlace.trip_id == trip_id)
    )
    row = TripPlace(
        trip_id=trip_id,
        place_id=payload.place_id,
        status=TripPlaceStatus.candidate,
        order_index=int(max_idx) + 1,
        preferred_duration=payload.preferred_duration,
        notes=payload.notes,
    )
    db.add(row)
    db.commit()
    row = db.scalar(
        select(TripPlace).where(TripPlace.id == row.id).options(joinedload(TripPlace.place))
    )
    return TripPlaceResponse.model_validate(row)


def update_trip_place(db: Session, trip_id: str, trip_place_id: str, payload: TripPlaceUpdate) -> TripPlaceResponse:
    _get_trip(db, trip_id)
    row = db.get(TripPlace, trip_place_id)
    if row is None or row.trip_id != trip_id:
        raise AppError(ErrorCode.NOT_FOUND, "地点池条目不存在", status_code=404)

    data = payload.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(row, key, value)
    row.updated_at = utc_now()
    db.commit()
    row = db.scalar(
        select(TripPlace).where(TripPlace.id == trip_place_id).options(joinedload(TripPlace.place))
    )
    return TripPlaceResponse.model_validate(row)
