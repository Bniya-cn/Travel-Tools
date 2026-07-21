"""Geo / city-center response DTOs."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CityCenterResponse(BaseModel):
    city_name: str = Field(min_length=1)
    lng: float
    lat: float
