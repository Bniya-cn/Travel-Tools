"""Validate itinerary item field combinations before persistence."""

from __future__ import annotations

from datetime import date, time

from app.core.errors import AppError, ErrorCode
from app.models.itinerary_item import ItemCategory, ItemKind


def validate_item_fields(
    *,
    is_all_day: bool,
    start_time: time | None,
    end_time: time | None,
    kind: ItemKind,
    category: ItemCategory | None,
) -> None:
    if is_all_day:
        if start_time is not None or end_time is not None:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                "全天事项的开始/结束时间必须为空",
                status_code=422,
            )
    else:
        if start_time is None or end_time is None:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                "非全天事项必须填写开始和结束时间",
                status_code=422,
            )
        if end_time <= start_time:
            raise AppError(
                ErrorCode.CROSS_MIDNIGHT_NOT_ALLOWED,
                "不允许跨午夜或结束时间不晚于开始时间，请拆成两天事项",
                status_code=422,
            )

    if kind == ItemKind.activity:
        if category is None:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                "activity 类型必须指定 category",
                status_code=422,
            )
    elif kind == ItemKind.transport:
        if category is not None:
            raise AppError(
                ErrorCode.VALIDATION_ERROR,
                "transport 类型的 category 必须为空",
                status_code=422,
            )


def ensure_date_in_trip_range(item_date: date, start_date: date, end_date: date) -> None:
    if not (start_date <= item_date <= end_date):
        raise AppError(
            ErrorCode.TRIP_DATE_RANGE_HAS_ITEMS,
            "事项日期必须在旅行起止日期范围内",
            details={
                "item_date": item_date.isoformat(),
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
            status_code=409,
        )
