"""Trip Pydantic schemas."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TripCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    city_name: str = Field(min_length=1, max_length=100)
    city_code: str | None = Field(default=None, max_length=20)
    timezone: str = Field(default="Asia/Shanghai", max_length=50)
    start_date: date
    end_date: date
    notes: str | None = None

    @model_validator(mode="after")
    def validate_date_range(self) -> TripCreate:
        if self.end_date < self.start_date:
            raise ValueError("end_date 必须大于或等于 start_date")
        return self


class TripUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    city_name: str | None = Field(default=None, min_length=1, max_length=100)
    city_code: str | None = Field(default=None, max_length=20)
    timezone: str | None = Field(default=None, max_length=50)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = None


class TripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    city_name: str
    city_code: str | None
    timezone: str
    start_date: date
    end_date: date
    notes: str | None
    created_at: datetime
    updated_at: datetime
    items_count: int | None = None
