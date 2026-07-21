"""Frozen route API contracts (Phase 3 Step 1.5).

Do not rename fields without explicit review.
Polyline contract everywhere: list[[lng, lat]] i.e. [lng, lat][].
preview_token: HMAC over trip/after/before/route_type/strategy/fingerprint/exp.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

RouteType = Literal["transit", "walking"]
LngLat = list[float]  # [lng, lat] length 2


class RouteStepDTO(BaseModel):
    instruction: str | None = None
    distance_meters: int | None = None
    duration_seconds: int | None = None
    mode: str | None = None


class RouteDTO(BaseModel):
    """Standard route DTO — only shape allowed in RouteCache.normalized_response_json."""

    route_type: RouteType
    strategy: int = 0
    duration_seconds: int
    distance_meters: int = 0
    walking_distance_meters: int | None = None
    transfer_count: int = 0
    polyline: list[LngLat] = Field(default_factory=list)
    steps: list[RouteStepDTO] = Field(default_factory=list)
    provider: str = "amap"
    provider_version: str = "v5"

    @field_validator("polyline")
    @classmethod
    def validate_polyline(cls, value: list[Any]) -> list[LngLat]:
        out: list[LngLat] = []
        for point in value:
            if not isinstance(point, (list, tuple)) or len(point) != 2:
                raise ValueError("polyline 必须为 [lng, lat][]")
            lng, lat = float(point[0]), float(point[1])
            out.append([lng, lat])
        return out


class RoutePreviewRequest(BaseModel):
    after_item_id: str = Field(min_length=1)
    before_item_id: str = Field(min_length=1)
    strategy: int | None = None


class RoutePreviewResponse(BaseModel):
    route: RouteDTO
    cache_hit: bool
    preview_token: str


class RouteSegmentCreate(BaseModel):
    after_item_id: str = Field(min_length=1)
    before_item_id: str = Field(min_length=1)
    route_type: RouteType
    strategy: int | None = None
    preview_token: str = Field(min_length=1)


class RouteSegmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    transport_item_id: str
    after_item_id: str
    before_item_id: str
    origin_place_id: str | None
    destination_place_id: str | None
    origin_name: str
    origin_lng: Decimal
    origin_lat: Decimal
    destination_name: str
    destination_lng: Decimal
    destination_lat: Decimal
    route_type: str
    strategy: int
    duration_seconds: int
    distance_meters: int
    walking_distance_meters: int | None
    transfer_count: int
    polyline_json: list[LngLat] | None = None
    steps_json: list[dict[str, Any]] | None = None
    provider: str
    provider_version: str
    created_at: datetime
    updated_at: datetime
