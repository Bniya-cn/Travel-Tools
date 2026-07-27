"""Routes preview / persist API tests with mocked Amap."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.schemas.routes import RouteDTO


def _trip(client):
    res = client.post(
        "/api/trips",
        json={
            "name": "路线测",
            "city_name": "西安",
            "start_date": "2026-10-01",
            "end_date": "2026-10-03",
        },
    )
    assert res.status_code == 201
    return res.json()["data"]


def _place(client, trip_id, name, lng, lat, poi):
    res = client.post(
        f"/api/trips/{trip_id}/places",
        json={"name": name, "amap_poi_id": poi, "lng": lng, "lat": lat, "city_name": "西安"},
    )
    assert res.status_code == 201
    return res.json()["data"]


def _item(client, trip_id, place_id, title, start, end):
    res = client.post(
        f"/api/trips/{trip_id}/items",
        json={
            "date": "2026-10-01",
            "start_time": start,
            "end_time": end,
            "kind": "activity",
            "category": "place",
            "title": title,
            "place_id": place_id,
        },
    )
    assert res.status_code == 201
    return res.json()["data"]


def _route_dto(duration=600) -> RouteDTO:
    return RouteDTO(
        route_type="walking",
        strategy=0,
        duration_seconds=duration,
        distance_meters=800,
        walking_distance_meters=800,
        transfer_count=0,
        polyline=[[108.9, 34.2], [109.0, 34.3]],
        steps=[],
        provider="amap",
        provider_version="v5",
    )


@pytest.fixture
def pair(client):
    trip = _trip(client)
    p1 = _place(client, trip["id"], "A", 108.9, 34.2, "PA")
    p2 = _place(client, trip["id"], "B", 109.0, 34.3, "PB")
    a = _item(client, trip["id"], p1["id"], "看A", "09:00", "10:00")
    b = _item(client, trip["id"], p2["id"], "看B", "12:00", "13:00")
    return trip, a, b


def test_preview_and_persist(client, monkeypatch, pair):
    trip, after, before = pair
    monkeypatch.setattr(
        "app.services.route_resolve.amap_routes.fetch_walking_route",
        AsyncMock(return_value=_route_dto(600)),
    )
    prev = client.post(
        "/api/routes/walking/preview",
        json={"after_item_id": after["id"], "before_item_id": before["id"]},
    )
    assert prev.status_code == 200
    body = prev.json()["data"]
    assert body["preview_token"]
    assert body["route"]["duration_seconds"] == 600

    saved = client.post(
        "/api/routes/segments",
        json={
            "after_item_id": after["id"],
            "before_item_id": before["id"],
            "route_type": "walking",
            "strategy": 0,
            "preview_token": body["preview_token"],
        },
    )
    assert saved.status_code == 201
    seg = saved.json()["data"]
    assert seg["transport_item_id"]

    # idempotent
    saved2 = client.post(
        "/api/routes/segments",
        json={
            "after_item_id": after["id"],
            "before_item_id": before["id"],
            "route_type": "walking",
            "strategy": 0,
            "preview_token": body["preview_token"],
        },
    )
    assert saved2.status_code == 201
    assert saved2.json()["data"]["id"] == seg["id"]

    items = client.get(f"/api/trips/{trip['id']}/items", params={"date": "2026-10-01"})
    kinds = [i["kind"] for i in items.json()["data"]]
    assert kinds.count("transport") == 1

    deleted = client.delete(f"/api/routes/segments/{seg['id']}")
    assert deleted.status_code == 200
    items2 = client.get(f"/api/trips/{trip['id']}/items", params={"date": "2026-10-01"})
    assert all(i["kind"] != "transport" for i in items2.json()["data"])


def test_transport_time_conflict(client, monkeypatch, pair):
    _trip_unused, after, before = pair
    monkeypatch.setattr(
        "app.services.route_resolve.amap_routes.fetch_walking_route",
        AsyncMock(return_value=_route_dto(duration=10_000)),
    )
    prev = client.post(
        "/api/routes/walking/preview",
        json={"after_item_id": after["id"], "before_item_id": before["id"]},
    )
    token = prev.json()["data"]["preview_token"]
    res = client.post(
        "/api/routes/segments",
        json={
            "after_item_id": after["id"],
            "before_item_id": before["id"],
            "route_type": "walking",
            "preview_token": token,
        },
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "TRANSPORT_TIME_CONFLICT"


def test_invalid_token(client, monkeypatch, pair):
    _t, after, before = pair
    monkeypatch.setattr(
        "app.services.route_resolve.amap_routes.fetch_walking_route",
        AsyncMock(return_value=_route_dto(600)),
    )
    res = client.post(
        "/api/routes/segments",
        json={
            "after_item_id": after["id"],
            "before_item_id": before["id"],
            "route_type": "walking",
            "preview_token": "bad|token",
        },
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "PREVIEW_TOKEN_INVALID"


def test_delete_activity_cleans_transport(client, monkeypatch, pair):
    trip, after, before = pair
    monkeypatch.setattr(
        "app.services.route_resolve.amap_routes.fetch_walking_route",
        AsyncMock(return_value=_route_dto(600)),
    )
    prev = client.post(
        "/api/routes/walking/preview",
        json={"after_item_id": after["id"], "before_item_id": before["id"]},
    )
    client.post(
        "/api/routes/segments",
        json={
            "after_item_id": after["id"],
            "before_item_id": before["id"],
            "route_type": "walking",
            "preview_token": prev.json()["data"]["preview_token"],
        },
    )
    assert client.delete(f"/api/items/{after['id']}").status_code == 200
    items = client.get(f"/api/trips/{trip['id']}/items", params={"date": "2026-10-01"})
    assert all(i["kind"] != "transport" for i in items.json()["data"])


def test_list_trip_segments_by_date(client, monkeypatch, pair):
    trip, after, before = pair
    monkeypatch.setattr(
        "app.services.route_resolve.amap_routes.fetch_walking_route",
        AsyncMock(return_value=_route_dto(600)),
    )
    prev = client.post(
        "/api/routes/walking/preview",
        json={"after_item_id": after["id"], "before_item_id": before["id"]},
    )
    client.post(
        "/api/routes/segments",
        json={
            "after_item_id": after["id"],
            "before_item_id": before["id"],
            "route_type": "walking",
            "preview_token": prev.json()["data"]["preview_token"],
        },
    )
    listed = client.get(
        f"/api/trips/{trip['id']}/route-segments",
        params={"date": "2026-10-01"},
    )
    assert listed.status_code == 200
    data = listed.json()["data"]
    assert len(data) == 1
    assert data[0]["polyline_json"]
    assert data[0]["origin_name"]

    empty = client.get(
        f"/api/trips/{trip['id']}/route-segments",
        params={"date": "2026-10-02"},
    )
    assert empty.status_code == 200
    assert empty.json()["data"] == []
