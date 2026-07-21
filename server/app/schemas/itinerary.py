"""Itinerary item Pydantic schemas."""

from __future__ import annotations

from datetime import date as Date
from datetime import datetime as DateTime
from datetime import time as Time

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.itinerary_item import ItemCategory, ItemKind
from app.schemas.place import PlaceResponse


def _parse_time(value: Time | str | None) -> Time | None:
    if value is None or isinstance(value, Time):
        return value
    text = value.strip()
    return Time.fromisoformat(text)


class ItineraryItemCreate(BaseModel):
    date: Date
    start_time: Time | None = None
    end_time: Time | None = None
    is_all_day: bool = False
    kind: ItemKind = ItemKind.activity
    category: ItemCategory | None = None
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    sort_order: int = 0
    place_id: str | None = None

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def coerce_time(cls, value: Time | str | None) -> Time | None:
        return _parse_time(value)


class ItineraryItemUpdate(BaseModel):
    date: Date | None = None
    start_time: Time | None = None
    end_time: Time | None = None
    is_all_day: bool | None = None
    kind: ItemKind | None = None
    category: ItemCategory | None = None
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    sort_order: int | None = None
    place_id: str | None = None

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def coerce_time(cls, value: Time | str | None) -> Time | None:
        return _parse_time(value)


class ItineraryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    place_id: str | None = None
    date: Date
    start_time: Time | None
    end_time: Time | None
    is_all_day: bool
    kind: ItemKind
    category: ItemCategory | None
    title: str
    description: str | None
    sort_order: int
    created_at: DateTime
    updated_at: DateTime
    place: PlaceResponse | None = None
