"""Trip API and cascade tests."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.itinerary_item import ItineraryItem


def test_create_trip_success(client) -> None:
    res = client.post(
        "/api/trips",
        json={
            "name": "西安五日游",
            "city_name": "西安",
                        "timezone": "Asia/Shanghai",
            "start_date": "2026-10-01",
            "end_date": "2026-10-05",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["error"] is None
    assert body["data"]["name"] == "西安五日游"
    assert body["data"]["items_count"] == 0


def test_create_trip_end_before_start_fails(client) -> None:
    res = client.post(
        "/api/trips",
        json={
            "name": "无效旅行",
            "city_name": "西安",
            "start_date": "2026-10-05",
            "end_date": "2026-10-01",
        },
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "VALIDATION_ERROR"


def test_delete_trip_cascades_items(client, db_session: Session) -> None:
    trip = client.post(
        "/api/trips",
        json={
            "name": "级联测试",
            "city_name": "西安",
            "start_date": "2026-10-01",
            "end_date": "2026-10-03",
        },
    ).json()["data"]
    trip_id = trip["id"]

    item_res = client.post(
        f"/api/trips/{trip_id}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:00",
            "is_all_day": False,
            "kind": "activity",
            "category": "place",
            "title": "城墙",
        },
    )
    assert item_res.status_code == 201

    del_res = client.delete(f"/api/trips/{trip_id}")
    assert del_res.status_code == 200
    assert del_res.json()["data"]["ok"] is True

    remaining = db_session.scalars(select(ItineraryItem).where(ItineraryItem.trip_id == trip_id)).all()
    assert remaining == []


def test_list_and_get_trip(client) -> None:
    created = client.post(
        "/api/trips",
        json={
            "name": "列表测试",
            "city_name": "西安",
            "start_date": "2026-10-01",
            "end_date": "2026-10-02",
        },
    ).json()["data"]
    listed = client.get("/api/trips")
    assert listed.status_code == 200
    assert any(t["id"] == created["id"] for t in listed.json()["data"])

    detail = client.get(f"/api/trips/{created['id']}")
    assert detail.status_code == 200
    assert detail.json()["data"]["items_count"] == 0
