"""Tests for city placeholder hints (fallback + AI path)."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import get_settings
from app.services import city_hints

_RealAsyncClient = httpx.AsyncClient


@pytest.fixture(autouse=True)
def _clear_settings() -> None:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_fallback_known_city() -> None:
    result = city_hints.fallback_hints("西安")
    assert result.source == "fallback"
    assert "城墙" in result.title_placeholder or "西安" in result.title_placeholder
    assert "兵马俑" in result.search_placeholder


def test_fallback_unknown_city() -> None:
    result = city_hints.fallback_hints("泉州")
    assert result.title_placeholder.startswith("例如：")
    assert "泉州" in result.title_placeholder
    assert result.source == "fallback"


@pytest.mark.asyncio
async def test_generate_without_ai_uses_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_API_BASE_URL", "")
    monkeypatch.setenv("AI_API_KEY", "")
    monkeypatch.setenv("AI_MODEL", "")
    get_settings.cache_clear()
    result = await city_hints.generate_city_hints("成都")
    assert result.source == "fallback"
    assert "宽窄巷子" in result.title_placeholder or "成都" in result.title_placeholder


@pytest.mark.asyncio
async def test_generate_with_ai_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_API_BASE_URL", "https://ai.example.com/v1")
    monkeypatch.setenv("AI_API_KEY", "sk-test")
    monkeypatch.setenv("AI_MODEL", "gpt-test")
    get_settings.cache_clear()

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path.endswith("/chat/completions")
        assert request.headers.get("Authorization") == "Bearer sk-test"
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": (
                                '{"title_placeholder":"例如：大雁塔",'
                                '"search_placeholder":"例如：回民街 / 钟楼"}'
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
    result = await city_hints.generate_city_hints("西安")
    assert result.source == "ai"
    assert result.title_placeholder == "例如：大雁塔"
    assert "回民街" in result.search_placeholder


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
    result = await city_hints.generate_city_hints("西安")
    assert result.source == "fallback"
