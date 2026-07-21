"""Application error codes and HTTP exception type."""

from __future__ import annotations

from typing import Any


class ErrorCode:
    # Base
    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    CONFLICT = "CONFLICT"
    INTERNAL_ERROR = "INTERNAL_ERROR"

    # Business (reserved for later phases)
    ITEM_TIME_CONFLICT = "ITEM_TIME_CONFLICT"
    TRIP_DATE_RANGE_HAS_ITEMS = "TRIP_DATE_RANGE_HAS_ITEMS"
    TRANSPORT_TIME_CONFLICT = "TRANSPORT_TIME_CONFLICT"
    PLACE_IN_USE = "PLACE_IN_USE"
    CROSS_CITY_TRANSIT_NOT_SUPPORTED = "CROSS_CITY_TRANSIT_NOT_SUPPORTED"
    TRIP_CITY_CODE_REQUIRED = "TRIP_CITY_CODE_REQUIRED"
    PLACE_CITY_MISMATCH = "PLACE_CITY_MISMATCH"


DEFAULT_STATUS: dict[str, int] = {
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.CONFLICT: 409,
    ErrorCode.INTERNAL_ERROR: 500,
    ErrorCode.ITEM_TIME_CONFLICT: 200,
    ErrorCode.TRIP_DATE_RANGE_HAS_ITEMS: 409,
    ErrorCode.TRANSPORT_TIME_CONFLICT: 409,
    ErrorCode.PLACE_IN_USE: 409,
    ErrorCode.CROSS_CITY_TRANSIT_NOT_SUPPORTED: 400,
    ErrorCode.TRIP_CITY_CODE_REQUIRED: 400,
    ErrorCode.PLACE_CITY_MISMATCH: 400,
}


class AppError(Exception):
    """Domain / API error converted to the unified JSON envelope."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        status_code: int | None = None,
    ) -> None:
        self.code = code
        self.message = message
        self.details = details or {}
        self.status_code = status_code if status_code is not None else DEFAULT_STATUS.get(code, 400)
        super().__init__(message)
