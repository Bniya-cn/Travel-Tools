"""Unified API response envelope (Pydantic v2)."""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T")


class ApiErrorBody(BaseModel):
    code: str
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class ApiResponse(BaseModel, Generic[T]):
    data: T | None = None
    error: ApiErrorBody | None = None


def ok(data: T) -> ApiResponse[T]:
    return ApiResponse(data=data, error=None)


def fail(code: str, message: str, details: dict[str, Any] | None = None) -> ApiResponse[None]:
    return ApiResponse(
        data=None,
        error=ApiErrorBody(code=code, message=message, details=details or {}),
    )
