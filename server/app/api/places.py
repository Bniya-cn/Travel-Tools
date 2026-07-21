"""Place search and CRUD API."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import AppError, ErrorCode
from app.db.session import get_db
from app.models.itinerary_item import ItineraryItem
from app.models.place import Place
from app.models.trip import Trip
from app.schemas.common import ApiResponse, ok
from app.schemas.place import PlaceCreate, PlaceResponse, PlaceSearchResult, PlaceUpdate
from app.services import amap_places as amap_places_service
from app.utils.datetime import utc_now

router = APIRouter(tags=["places"])


def _get_trip_or_404(db: Session, trip_id: str) -> Trip:
    trip = db.get(Trip, trip_id)
    if trip is None:
        raise AppError(ErrorCode.NOT_FOUND, "旅行不存在", status_code=404)
    return trip


def _get_place_or_404(db: Session, place_id: str) -> Place:
    place = db.get(Place, place_id)
    if place is None:
        raise AppError(ErrorCode.NOT_FOUND, "地点不存在", status_code=404)
    return place


@router.get("/api/places/search", response_model=ApiResponse[list[PlaceSearchResult]])
async def search_places(
    keyword: str = Query(min_length=1),
    city_code: str = Query(min_length=1),
) -> ApiResponse[list[PlaceSearchResult]]:
    results = await amap_places_service.search_places(keyword=keyword, city_code=city_code)
    return ok(results)


@router.get("/api/trips/{trip_id}/places", response_model=ApiResponse[list[PlaceResponse]])
def list_places(trip_id: str, db: Session = Depends(get_db)) -> ApiResponse[list[PlaceResponse]]:
    _get_trip_or_404(db, trip_id)
    places = db.scalars(
        select(Place).where(Place.trip_id == trip_id).order_by(Place.created_at.desc())
    ).all()
    return ok([PlaceResponse.model_validate(p) for p in places])


@router.post(
    "/api/trips/{trip_id}/places",
    response_model=ApiResponse[PlaceResponse],
    status_code=201,
)
def create_place(
    trip_id: str,
    payload: PlaceCreate,
    db: Session = Depends(get_db),
) -> ApiResponse[PlaceResponse]:
    _get_trip_or_404(db, trip_id)

    if payload.amap_poi_id:
        existing = db.scalar(
            select(Place).where(
                Place.trip_id == trip_id,
                Place.amap_poi_id == payload.amap_poi_id,
            )
        )
        if existing is not None:
            return ok(PlaceResponse.model_validate(existing))

    place = Place(
        trip_id=trip_id,
        amap_poi_id=payload.amap_poi_id,
        name=payload.name,
        address=payload.address,
        city_name=payload.city_name,
        city_code=payload.city_code,
        district=payload.district,
        lng=Decimal(str(round(payload.lng, 6))),
        lat=Decimal(str(round(payload.lat, 6))),
    )
    db.add(place)
    db.commit()
    db.refresh(place)
    return ok(PlaceResponse.model_validate(place))


@router.patch("/api/places/{place_id}", response_model=ApiResponse[PlaceResponse])
def update_place(
    place_id: str,
    payload: PlaceUpdate,
    db: Session = Depends(get_db),
) -> ApiResponse[PlaceResponse]:
    place = _get_place_or_404(db, place_id)
    data = payload.model_dump(exclude_unset=True)
    if "lng" in data and data["lng"] is not None:
        data["lng"] = Decimal(str(round(float(data["lng"]), 6)))
    if "lat" in data and data["lat"] is not None:
        data["lat"] = Decimal(str(round(float(data["lat"]), 6)))
    for key, value in data.items():
        setattr(place, key, value)
    place.updated_at = utc_now()
    db.commit()
    db.refresh(place)
    return ok(PlaceResponse.model_validate(place))


@router.delete("/api/places/{place_id}", response_model=ApiResponse[dict])
def delete_place(place_id: str, db: Session = Depends(get_db)) -> ApiResponse[dict]:
    place = _get_place_or_404(db, place_id)
    in_use = db.scalar(
        select(func.count()).select_from(ItineraryItem).where(ItineraryItem.place_id == place_id)
    )
    if in_use:
        raise AppError(
            ErrorCode.PLACE_IN_USE,
            "地点仍被日程事项引用，无法删除",
            details={"item_count": int(in_use)},
            status_code=409,
        )
    db.delete(place)
    db.commit()
    return ok({"ok": True})
