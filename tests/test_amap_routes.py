"""Amap routes adapter unit tests with httpx mock."""

from __future__ import annotations

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import AppError, ErrorCode
from app.services import amap_routes

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

    monkeypatch.setattr(amap_routes.httpx, "AsyncClient", factory)


@pytest.mark.asyncio
async def test_transit_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "status": "1",
        "route": {
            "transits": [
                {
                    "duration": "2400",
                    "distance": "15000",
                    "walking_distance": "800",
                    "segments": [
                        {
                            "walking": {
                                "steps": [
                                    {
                                        "instruction": "步行",
                                        "distance": "200",
                                        "duration": "180",
                                        "polyline": "108.94,34.26;108.95,34.27",
                                    }
                                ]
                            },
                            "bus": {
                                "buslines": [
                                    {
                                        "name": "地铁2号线(韦曲南--北客站)",
                                        "type": "地铁线路",
                                        "distance": "10000",
                                        "duration": "1200",
                                        "via_num": "5",
                                        "departure_stop": {"name": "北大街"},
                                        "arrival_stop": {"name": "小寨"},
                                        "polyline": "108.95,34.27;108.96,34.28",
                                    }
                                ]
                            },
                        }
                    ],
                }
            ]
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert "AlternativeRoute" in request.url.params
        return httpx.Response(200, json=payload)

    _patch_client(monkeypatch, handler)
    dto = await amap_routes.fetch_transit_route(
        origin_lng=108.94,
        origin_lat=34.26,
        dest_lng=108.96,
        dest_lat=34.28,
        city_name="西安",
    )
    assert dto.route_type == "transit"
    assert dto.duration_seconds == 2400
    assert len(dto.polyline) >= 2
    transit_steps = [s for s in dto.steps if s.mode == "transit"]
    assert len(transit_steps) == 1
    assert transit_steps[0].departure_stop == "北大街"
    assert transit_steps[0].arrival_stop == "小寨"
    assert transit_steps[0].via_num == 5
    assert transit_steps[0].instruction is not None
    assert "北大街" in transit_steps[0].instruction
    assert "小寨" in transit_steps[0].instruction
    assert "共 6 站" in transit_steps[0].instruction


def test_format_transit_instruction() -> None:
    text = amap_routes.format_transit_instruction(
        line_name="地铁2号线(韦曲南--北客站)",
        line_type="地铁线路",
        departure_stop="北大街",
        arrival_stop="小寨",
        via_num=5,
    )
    assert text == "地铁2号线 · 北大街上车 → 小寨下车 · 共 6 站"


def test_format_route_steps_summary() -> None:
    from app.schemas.routes import RouteStepDTO

    summary = amap_routes.format_route_steps_summary(
        [
            RouteStepDTO(instruction="步行至地铁站", mode="walking", distance_meters=200),
            RouteStepDTO(
                instruction="地铁2号线 · 北大街上车 → 小寨下车 · 共 6 站",
                mode="transit",
            ),
        ]
    )
    assert summary is not None
    assert "步行约 200 米" in summary
    assert "地铁2号线" in summary
    assert "步行至地铁站" not in summary


def test_simplify_route_steps_merges_walk() -> None:
    from app.schemas.routes import RouteStepDTO

    out = amap_routes.simplify_route_steps(
        [
            RouteStepDTO(instruction="步行43米右转", mode="walking", distance_meters=43),
            RouteStepDTO(instruction="步行114米左转", mode="walking", distance_meters=114),
            RouteStepDTO(instruction="地铁1号线", mode="transit"),
            RouteStepDTO(instruction="步行78米", mode="walking", distance_meters=78),
        ]
    )
    assert len(out) == 3
    assert out[0].instruction == "步行约 157 米"
    assert out[1].mode == "transit"
    assert out[2].instruction == "步行约 78 米"


@pytest.mark.asyncio
async def test_walking_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "status": "1",
        "route": {
            "paths": [
                {
                    "duration": "600",
                    "distance": "800",
                    "steps": [
                        {
                            "instruction": "直行",
                            "distance": "800",
                            "duration": "600",
                            "polyline": "108.94,34.26;108.95,34.27",
                        }
                    ],
                }
            ]
        },
    }

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    _patch_client(monkeypatch, handler)
    dto = await amap_routes.fetch_walking_route(
        origin_lng=108.94,
        origin_lat=34.26,
        dest_lng=108.95,
        dest_lat=34.27,
    )
    assert dto.route_type == "walking"
    assert dto.duration_seconds == 600


@pytest.mark.asyncio
async def test_status_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"status": "0", "info": "INVALID"})

    _patch_client(monkeypatch, handler)
    with pytest.raises(AppError) as exc:
        await amap_routes.fetch_walking_route(
            origin_lng=1.0, origin_lat=1.0, dest_lng=2.0, dest_lat=2.0
        )
    assert exc.value.code == ErrorCode.AMAP_SERVICE_ERROR


@pytest.mark.asyncio
async def test_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout")

    _patch_client(monkeypatch, handler)
    with pytest.raises(AppError) as exc:
        await amap_routes.fetch_walking_route(
            origin_lng=1.0, origin_lat=1.0, dest_lng=2.0, dest_lat=2.0
        )
    assert exc.value.code == ErrorCode.AMAP_SERVICE_ERROR


@pytest.mark.asyncio
async def test_missing_duration(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"status": "1", "route": {"paths": [{"distance": "100", "steps": []}]}},
        )

    _patch_client(monkeypatch, handler)
    with pytest.raises(AppError) as exc:
        await amap_routes.fetch_walking_route(
            origin_lng=1.0, origin_lat=1.0, dest_lng=2.0, dest_lat=2.0
        )
    assert exc.value.code == ErrorCode.AMAP_SERVICE_ERROR


@pytest.mark.asyncio
async def test_missing_polyline(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "status": "1",
                "route": {
                    "paths": [{"duration": "10", "distance": "10", "steps": [{"instruction": "x"}]}]
                },
            },
        )

    _patch_client(monkeypatch, handler)
    with pytest.raises(AppError) as exc:
        await amap_routes.fetch_walking_route(
            origin_lng=1.0, origin_lat=1.0, dest_lng=2.0, dest_lat=2.0
        )
    assert exc.value.code == ErrorCode.AMAP_SERVICE_ERROR


def test_parse_polyline() -> None:
    assert amap_routes.parse_polyline("108.9,34.2;109.0,34.3") == [[108.9, 34.2], [109.0, 34.3]]
