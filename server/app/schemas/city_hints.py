"""City copy hints for form placeholders."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CityHintsResponse(BaseModel):
    city_name: str = Field(min_length=1)
    title_placeholder: str = Field(min_length=1)
    search_placeholder: str = Field(min_length=1)
    source: Literal["ai", "fallback"]
