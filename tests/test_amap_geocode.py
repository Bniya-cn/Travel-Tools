"""Tests for Amap city geocode."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.services import amap_geocode

_RealAsyncClient = httpx.AsyncClient


@pytest.fixture(autouse=True)
def _amap_key(monkeypatch: pytest.MonkeyPatch) -> None:
    get_settings.cache_clear()
    monkeypatch.setenv("AMAP_WEB_SERVICE_KEY", "test-key-not-real")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _patch_client(monkeypatch: pytest.MonkeyPatch, handler) -> None:
    transport = httpx.MockTransport(handler)

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return _RealAsyncClient(*args, **kwargs)

    monkeypatch.setattr(amap_geocode.httpx, "AsyncClient", factory)


@pytest.mark.asyncio
async def test_geocode_city_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["address"] == "西安"
        return httpx.Response(
            200,
            json={
                "status": "1",
                "geocodes": [{"location": "108.9398,34.3416", "formatted_address": "陕西省西安市"}],
            },
        )

    _patch_client(monkeypatch, handler)
    result = await amap_geocode.geocode_city("西安")
    assert result.city_name == "西安"
    assert result.lng == pytest.approx(108.9398)
    assert result.lat == pytest.approx(34.3416)


@pytest.mark.asyncio
async def test_geocode_city_empty_raises() -> None:
    with pytest.raises(AppError) as exc:
        await amap_geocode.geocode_city("  ")
    assert exc.value.code == ErrorCode.VALIDATION_ERROR
