"""RoutePlanDraft API schemas."""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.route_plan_draft import DraftSource, DraftStatus
from app.schemas.routes import RouteDTO


class DraftStop(BaseModel):
    place_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    start_time: str | None = None  # "HH:MM"
    end_time: str | None = None
    order: int = Field(ge=1)
    preferred_duration_minutes: int | None = Field(default=None, ge=1, le=24 * 60)

    @field_validator("start_time", "end_time", mode="before")
    @classmethod
    def empty_to_none(cls, value: object) -> object:
        if value is None:
            return None
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_hhmm(cls, value: str | None) -> str | None:
        if value is None:
            return None
        raw = value.strip()
        # 兼容浏览器 time 输入可能带秒：09:00:00
        try:
            parsed = time.fromisoformat(raw)
        except ValueError as exc:
            raise ValueError("时间格式必须为 HH:MM") from exc
        return parsed.strftime("%H:%M")

    @model_validator(mode="after")
    def check_time_pair(self) -> DraftStop:
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValueError("end_time 必须晚于 start_time（不可跨午夜）")
        return self


class RoutePlanDraftUpsert(BaseModel):
    date: date
    source: DraftSource = DraftSource.manual
    stops: list[DraftStop] = Field(default_factory=list)


class RoutePlanDraftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    trip_id: str
    date: date
    source: DraftSource
    stops: list[DraftStop]
    status: DraftStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_draft(cls, draft: Any) -> RoutePlanDraftResponse:
        raw = draft.stops_json or []
        stops = [DraftStop.model_validate(s) for s in raw]
        return cls(
            id=draft.id,
            trip_id=draft.trip_id,
            date=draft.date,
            source=draft.source,
            stops=stops,
            status=draft.status,
            created_at=draft.created_at,
            updated_at=draft.updated_at,
        )


class DraftRouteSegmentPreview(BaseModel):
    from_place_id: str
    to_place_id: str
    from_order: int
    to_order: int
    route: RouteDTO
    preview_token: str
    cache_hit: bool = False
    time_conflict: bool = False
    available_duration_seconds: int | None = None


class GenerateRoutesResponse(BaseModel):
    draft_id: str
    segments: list[DraftRouteSegmentPreview]


class ConfirmDraftResponse(BaseModel):
    draft: RoutePlanDraftResponse
    item_ids: list[str]
    segment_ids: list[str]


class AiPlanRequest(BaseModel):
    date: date
    place_ids: list[str] = Field(min_length=1)
    day_start: str = "09:00"
    day_end: str = "21:00"
    preferences: list[str] = Field(default_factory=list)

    @field_validator("day_start", "day_end")
    @classmethod
    def validate_hhmm(cls, value: str) -> str:
        try:
            time.fromisoformat(value)
        except ValueError as exc:
            raise ValueError("时间格式必须为 HH:MM") from exc
        return value

    @model_validator(mode="after")
    def check_window(self) -> AiPlanRequest:
        if self.day_end <= self.day_start:
            raise ValueError("day_end 必须晚于 day_start")
        return self
