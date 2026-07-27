"""Phase 0/1 map workspace model & API tests."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.schemas.routes import RouteDTO


def _trip(client):
    res = client.post(
        "/api/trips",
        json={
            "name": "地图池测",
            "city_name": "广州",
            "start_date": "2026-10-01",
            "end_date": "2026-10-03",
        },
    )
    assert res.status_code == 201
    return res.json()["data"]


def _place(client, trip_id, name, lng, lat, poi):
    res = client.post(
        f"/api/trips/{trip_id}/places",
        json={"name": name, "amap_poi_id": poi, "lng": lng, "lat": lat, "city_name": "广州"},
    )
    assert res.status_code == 201
    return res.json()["data"]


def test_trip_place_pool_and_draft(client):
    trip = _trip(client)
    p1 = _place(client, trip["id"], "广州塔", 113.32, 23.11, "P1")
    p2 = _place(client, trip["id"], "陈家祠", 113.25, 23.13, "P2")

    # create place 已自动入池；再 POST 应幂等 201
    r1 = client.post(f"/api/trips/{trip['id']}/trip-places", json={"place_id": p1["id"]})
    assert r1.status_code == 201
    assert r1.json()["data"]["status"] == "candidate"

    r2 = client.post(f"/api/trips/{trip['id']}/trip-places", json={"place_id": p2["id"]})
    assert r2.status_code == 201

    listed = client.get(f"/api/trips/{trip['id']}/trip-places")
    assert listed.status_code == 200
    assert len(listed.json()["data"]) == 2

    draft = client.put(
        f"/api/trips/{trip['id']}/plan-drafts",
        json={
            "date": "2026-10-01",
            "source": "manual",
            "stops": [
                {
                    "place_id": p1["id"],
                    "title": "登广州塔",
                    "start_time": "09:00",
                    "end_time": "11:00",
                    "order": 1,
                    "preferred_duration_minutes": 120,
                },
                {
                    "place_id": p2["id"],
                    "title": "逛陈家祠",
                    "start_time": "12:00",
                    "end_time": "14:00",
                    "order": 2,
                },
            ],
        },
    )
    assert draft.status_code == 200
    body = draft.json()["data"]
    assert body["status"] == "draft"
    assert len(body["stops"]) == 2

    got = client.get(f"/api/trips/{trip['id']}/plan-drafts", params={"date": "2026-10-01"})
    assert got.status_code == 200
    assert got.json()["data"]["id"] == body["id"]


def test_generate_and_confirm(client, monkeypatch):
    trip = _trip(client)
    p1 = _place(client, trip["id"], "A", 113.32, 23.11, "PA")
    p2 = _place(client, trip["id"], "B", 113.25, 23.13, "PB")
    client.post(f"/api/trips/{trip['id']}/trip-places", json={"place_id": p1["id"]})
    client.post(f"/api/trips/{trip['id']}/trip-places", json={"place_id": p2["id"]})
    draft = client.put(
        f"/api/trips/{trip['id']}/plan-drafts",
        json={
            "date": "2026-10-01",
            "source": "manual",
            "stops": [
                {"place_id": p1["id"], "title": "A", "start_time": "09:00", "end_time": "10:00", "order": 1},
                {"place_id": p2["id"], "title": "B", "start_time": "12:00", "end_time": "13:00", "order": 2},
            ],
        },
    ).json()["data"]

    route = RouteDTO(
        route_type="transit",
        strategy=7,
        duration_seconds=600,
        distance_meters=2000,
        walking_distance_meters=400,
        transfer_count=1,
        polyline=[[113.32, 23.11], [113.25, 23.13]],
        steps=[],
    )
    monkeypatch.setattr(
        "app.services.route_resolve.amap_routes.fetch_transit_route",
        AsyncMock(return_value=route),
    )

    gen = client.post(
        f"/api/trips/{trip['id']}/plan-drafts/{draft['id']}/generate-routes",
        params={"route_type": "transit"},
    )
    assert gen.status_code == 200
    segs = gen.json()["data"]["segments"]
    assert len(segs) == 1
    assert segs[0]["route"]["duration_seconds"] == 600
    assert segs[0]["time_conflict"] is False

    conf = client.post(
        f"/api/trips/{trip['id']}/plan-drafts/{draft['id']}/confirm",
        params={"route_type": "transit"},
    )
    assert conf.status_code == 200
    data = conf.json()["data"]
    assert data["draft"]["status"] == "confirmed"
    assert len(data["item_ids"]) == 2
    assert len(data["segment_ids"]) == 1

    items = client.get(f"/api/trips/{trip['id']}/items", params={"date": "2026-10-01"})
    assert items.status_code == 200
    kinds = {i["kind"] for i in items.json()["data"]}
    assert "activity" in kinds
    assert "transport" in kinds


def test_ai_plan_fallback(client, monkeypatch):
    trip = _trip(client)
    p1 = _place(client, trip["id"], "塔", 113.32, 23.11, "T1")
    p2 = _place(client, trip["id"], "祠", 113.25, 23.13, "T2")
    monkeypatch.setenv("AI_API_BASE_URL", "")
    monkeypatch.setenv("AI_API_KEY", "")
    monkeypatch.setenv("AI_MODEL", "")
    from app.core.config import get_settings

    get_settings.cache_clear()

    res = client.post(
        f"/api/trips/{trip['id']}/ai-plan",
        json={
            "date": "2026-10-01",
            "place_ids": [p1["id"], p2["id"]],
            "day_start": "09:00",
            "day_end": "18:00",
        },
    )
    assert res.status_code == 201
    body = res.json()["data"]
    assert body["status"] == "draft"
    assert len(body["stops"]) == 2
    get_settings.cache_clear()
