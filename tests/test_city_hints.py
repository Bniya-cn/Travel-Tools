"""Tests for city recommendations (titles + Amap-resolved places)."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import get_settings
from app.schemas.place import PlaceSearchResult
from app.services import city_hints

_RealAsyncClient = httpx.AsyncClient


@pytest.fixture(autouse=True)
def _clear_settings() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_fallback_guangzhou_includes_sysu() -> None:
    bundle = city_hints.fallback_bundle("广州")
    assert "中山大学" in bundle.place_names
    assert any("中山大学" in t for t in bundle.titles)


def test_fallback_unknown_city() -> None:
    bundle = city_hints.fallback_bundle("泉州")
    assert bundle.titles
    assert bundle.place_names
    assert bundle.source == "fallback"


@pytest.mark.asyncio
async def test_generate_without_ai_resolves_amap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_API_BASE_URL", "")
    monkeypatch.setenv("AI_API_KEY", "")
    monkeypatch.setenv("AI_MODEL", "")
    get_settings.cache_clear()

    async def fake_resolve(city: str, names: list[str]) -> list[PlaceSearchResult]:
        assert city == "广州"
        assert "中山大学" in names
        return [
            PlaceSearchResult(
                name="中山大学",
                address="广州市海珠区",
                city_name="广州市",
                district="海珠区",
                lng=113.3,
                lat=23.1,
                amap_poi_id="B001",
            )
        ]

    monkeypatch.setattr(city_hints, "resolve_place_names", fake_resolve)
    result = await city_hints.generate_city_hints("广州")
    assert result.source == "fallback"
    assert result.places[0].name == "中山大学"
    assert result.places[0].address == "广州市海珠区"


@pytest.mark.asyncio
async def test_generate_with_ai_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_API_BASE_URL", "https://ai.example.com/v1")
    monkeypatch.setenv("AI_API_KEY", "sk-test")
    monkeypatch.setenv("AI_MODEL", "gpt-test")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"titles":["参观中山大学","逛陈家祠"],'
                                '"places":["中山大学","陈家祠"]}'
                            )
                        }
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return _RealAsyncClient(*args, **kwargs)

    monkeypatch.setattr(city_hints.httpx, "AsyncClient", factory)

    async def fake_resolve(_city: str, names: list[str]) -> list[PlaceSearchResult]:
        return [
            PlaceSearchResult(
                name=n,
                address=f"{n}地址",
                city_name="广州市",
                district=None,
                lng=113.0,
                lat=23.0,
                amap_poi_id=f"id-{n}",
            )
            for n in names
        ]

    monkeypatch.setattr(city_hints, "resolve_place_names", fake_resolve)
    result = await city_hints.generate_city_hints("广州")
    assert result.source == "ai"
    assert result.titles == ["参观中山大学", "逛陈家祠"]
    assert [p.name for p in result.places] == ["中山大学", "陈家祠"]


@pytest.mark.asyncio
async def test_generate_ai_failure_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_API_BASE_URL", "https://ai.example.com/v1")
    monkeypatch.setenv("AI_API_KEY", "sk-test")
    monkeypatch.setenv("AI_MODEL", "gpt-test")
    get_settings.cache_clear()

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"error": "boom"})

    transport = httpx.MockTransport(handler)

    def factory(*args, **kwargs):
        kwargs["transport"] = transport
        return _RealAsyncClient(*args, **kwargs)

    monkeypatch.setattr(city_hints.httpx, "AsyncClient", factory)
    monkeypatch.setattr(city_hints, "resolve_place_names", lambda *_a, **_k: _async_empty())

    async def _async_empty(*_a, **_k):
        return []

    monkeypatch.setattr(city_hints, "resolve_place_names", _async_empty)
    result = await city_hints.generate_city_hints("广州")
    assert result.source == "fallback"
    assert any("中山大学" in t for t in result.titles)
