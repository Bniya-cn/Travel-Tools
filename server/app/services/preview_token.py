"""preview_token HMAC helpers — bind preview RouteDTO to persist."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.schemas.routes import RouteDTO


def route_fingerprint(route: RouteDTO) -> str:
    payload = route.model_dump(mode="json")
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def issue_preview_token(
    *,
    trip_id: str,
    after_item_id: str,
    before_item_id: str,
    route_type: str,
    strategy: int,
    route: RouteDTO,
) -> str:
    settings = get_settings()
    exp = int(time.time()) + int(settings.preview_token_ttl_seconds)
    fp = route_fingerprint(route)
    body = "|".join(
        [
            trip_id,
            after_item_id,
            before_item_id,
            route_type,
            str(strategy),
            fp,
            str(exp),
        ]
    )
    sig = hmac.new(
        settings.secret_key.encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{body}|{sig}"


def verify_preview_token(
    token: str,
    *,
    trip_id: str,
    after_item_id: str,
    before_item_id: str,
    route_type: str,
    strategy: int,
    route: RouteDTO,
) -> None:
    settings = get_settings()
    parts = token.split("|")
    if len(parts) != 8:
        raise AppError(ErrorCode.PREVIEW_TOKEN_INVALID, "preview_token 无效", status_code=422)

    (
        t_trip,
        t_after,
        t_before,
        t_type,
        t_strategy,
        t_fp,
        t_exp,
        t_sig,
    ) = parts

    body = "|".join(parts[:-1])
    expected = hmac.new(
        settings.secret_key.encode("utf-8"),
        body.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, t_sig):
        raise AppError(ErrorCode.PREVIEW_TOKEN_INVALID, "preview_token 签名无效", status_code=422)

    try:
        exp = int(t_exp)
    except ValueError as exc:
        raise AppError(ErrorCode.PREVIEW_TOKEN_INVALID, "preview_token 过期时间无效", status_code=422) from exc

    if exp < int(time.time()):
        raise AppError(ErrorCode.PREVIEW_TOKEN_INVALID, "preview_token 已过期", status_code=422)

    if (
        t_trip != trip_id
        or t_after != after_item_id
        or t_before != before_item_id
        or t_type != route_type
        or t_strategy != str(strategy)
    ):
        raise AppError(ErrorCode.PREVIEW_TOKEN_INVALID, "preview_token 与请求不匹配", status_code=422)

    if t_fp != route_fingerprint(route):
        raise AppError(ErrorCode.PREVIEW_TOKEN_INVALID, "preview_token 与路线内容不匹配", status_code=422)


def parse_token_fields(token: str) -> dict[str, Any]:
    parts = token.split("|")
    if len(parts) != 8:
        raise AppError(ErrorCode.PREVIEW_TOKEN_INVALID, "preview_token 无效", status_code=422)
    return {
        "trip_id": parts[0],
        "after_item_id": parts[1],
        "before_item_id": parts[2],
        "route_type": parts[3],
        "strategy": int(parts[4]),
        "fingerprint": parts[5],
        "exp": int(parts[6]),
    }
