"""Place Pydantic schemas."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlaceSearchResult(BaseModel):
    name: str
    address: str | None = None
    city_name: str | None = None
    district: str | None = None
    lng: float
    lat: float
    amap_poi_id: str | None = None


class PlaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    amap_poi_id: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=500)
    city_name: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    lng: float
    lat: float

    @field_validator("lng", "lat")
    @classmethod
    def finite_coord(cls, value: float) -> float:
        if value != value:  # NaN
            raise ValueError("坐标无效")
        return value


class PlaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=500)
    city_name: str | None = Field(default=None, max_length=100)
    district: str | None = Field(default=None, max_length=100)
    lng: float | None = None
    lat: float | None = None


class PlaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    amap_poi_id: str | None
    name: str
    address: str | None
    city_name: str | None
    district: str | None
    lng: Decimal
    lat: Decimal
    created_at: datetime
    updated_at: datetime
