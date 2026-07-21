"""Amap place search adapter unit tests with httpx mock."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.services import amap_places

# 保留真实 AsyncClient，避免 monkeypatch 后 lambda 自调用导致递归
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

    monkeypatch.setattr(amap_places.httpx, "AsyncClient", factory)


@pytest.mark.asyncio
async def test_search_normal(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "status": "1",
        "pois": [
            {
                "id": "B000A7BD6C",
                "name": "陕西历史博物馆",
                "address": "西安市雁塔区",
                "cityname": "西安市",
                "citycode": "029",
                "adname": "雁塔区",
                "location": "108.9599,34.2195",
            }
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert "key" in request.url.params
        assert request.url.params["key"] == "test-key-not-real"
        return httpx.Response(200, json=payload)

    _patch_client(monkeypatch, handler)
    results = await amap_places.search_places(keyword="博物馆", city_code="029")
    assert len(results) == 1
    assert results[0].name == "陕西历史博物馆"
    assert results[0].lng == 108.9599


@pytest.mark.asyncio
async def test_search_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "1", "pois": []})

    _patch_client(monkeypatch, handler)
    results = await amap_places.search_places(keyword="xxx", city_code="029")
    assert results == []


@pytest.mark.asyncio
async def test_status_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"status": "0", "info": "INVALID_USER_KEY", "infocode": "10001"},
        )

    _patch_client(monkeypatch, handler)
    with pytest.raises(AppError) as exc:
        await amap_places.search_places(keyword="博物馆", city_code="029")
    assert exc.value.code == ErrorCode.AMAP_SERVICE_ERROR


@pytest.mark.asyncio
async def test_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout")

    _patch_client(monkeypatch, handler)
    with pytest.raises(AppError) as exc:
        await amap_places.search_places(keyword="博物馆", city_code="029")
    assert exc.value.code == ErrorCode.AMAP_SERVICE_ERROR


@pytest.mark.asyncio
async def test_missing_location_skipped(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "status": "1",
                "pois": [
                    {"id": "1", "name": "无坐标", "location": ""},
                    {
                        "id": "2",
                        "name": "有坐标",
                        "location": "108.9,34.2",
                        "address": "x",
                    },
                ],
            },
        )

    _patch_client(monkeypatch, handler)
    results = await amap_places.search_places(keyword="t", city_code="029")
    assert len(results) == 1
    assert results[0].name == "有坐标"


def test_map_poi_helper() -> None:
    assert amap_places.map_poi_to_result({"name": "x"}) is None
    ok = amap_places.map_poi_to_result(
        {"name": "城墙", "location": "108.94,34.26", "id": "P1"}
    )
    assert ok is not None
    assert ok.amap_poi_id == "P1"
