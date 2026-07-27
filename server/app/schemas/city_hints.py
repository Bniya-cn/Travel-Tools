"""City recommendations: activity titles + real Amap-resolved places."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.place import PlaceSearchResult


class CityHintsResponse(BaseModel):
    city_name: str = Field(min_length=1)
    titles: list[str] = Field(default_factory=list)
    places: list[PlaceSearchResult] = Field(default_factory=list)
    source: Literal["ai", "fallback"]
