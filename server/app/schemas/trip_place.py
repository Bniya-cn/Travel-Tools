"""TripPlace API schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.trip_place import TripPlaceStatus
from app.schemas.place import PlaceResponse


class TripPlaceCreate(BaseModel):
    place_id: str = Field(min_length=1)
    preferred_duration: int | None = Field(default=None, ge=1, le=24 * 60)
    notes: str | None = Field(default=None, max_length=2000)


class TripPlaceUpdate(BaseModel):
    status: TripPlaceStatus | None = None
    order_index: int | None = Field(default=None, ge=0)
    preferred_duration: int | None = Field(default=None, ge=1, le=24 * 60)
    notes: str | None = Field(default=None, max_length=2000)


class TripPlaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    place_id: str
    status: TripPlaceStatus
    order_index: int
    preferred_duration: int | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    place: PlaceResponse | None = None
