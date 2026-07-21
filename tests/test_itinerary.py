"""Itinerary item rules and API tests."""

from __future__ import annotations


def _create_trip(client, **overrides):
    payload = {
        "name": "西安五日游",
        "city_name": "西安",
        "city_code": "029",
        "start_date": "2026-10-01",
        "end_date": "2026-10-05",
    }
    payload.update(overrides)
    res = client.post("/api/trips", json=payload)
    assert res.status_code == 201
    return res.json()["data"]


def test_create_item_success(client) -> None:
    trip = _create_trip(client)
    res = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "11:00",
            "is_all_day": False,
            "kind": "activity",
            "category": "place",
            "title": "西安城墙",
        },
    )
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["title"] == "西安城墙"
    assert data["start_time"].startswith("09:00")


def test_item_date_out_of_range(client) -> None:
    trip = _create_trip(client)
    res = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-09-30",
            "start_time": "09:00",
            "end_time": "10:00",
            "kind": "activity",
            "category": "place",
            "title": "越界",
        },
    )
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "TRIP_DATE_RANGE_HAS_ITEMS"


def test_all_day_item(client) -> None:
    trip = _create_trip(client)
    res = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "is_all_day": True,
            "kind": "activity",
            "category": "custom",
            "title": "购买保险",
        },
    )
    assert res.status_code == 201
    data = res.json()["data"]
    assert data["is_all_day"] is True
    assert data["start_time"] is None
    assert data["end_time"] is None

    # All-day does not conflict with timed item
    timed = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:00",
            "kind": "activity",
            "category": "meal",
            "title": "早餐",
        },
    )
    assert timed.status_code == 201


def test_adjacent_times_no_conflict(client) -> None:
    trip = _create_trip(client)
    a = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:00",
            "kind": "activity",
            "category": "place",
            "title": "A",
        },
    )
    b = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "10:00",
            "end_time": "11:00",
            "kind": "activity",
            "category": "place",
            "title": "B",
        },
    )
    assert a.status_code == 201
    assert b.status_code == 201


def test_overlapping_times_conflict(client) -> None:
    trip = _create_trip(client)
    client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:30",
            "kind": "activity",
            "category": "place",
            "title": "A",
        },
    )
    res = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "10:00",
            "end_time": "11:00",
            "kind": "activity",
            "category": "place",
            "title": "B",
        },
    )
    assert res.status_code == 409
    err = res.json()["error"]
    assert err["code"] == "ITEM_TIME_CONFLICT"
    assert "conflict_item_id" in err["details"]


def test_cross_midnight_rejected(client) -> None:
    trip = _create_trip(client)
    res = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "23:00",
            "end_time": "01:00",
            "kind": "activity",
            "category": "place",
            "title": "跨午夜",
        },
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "CROSS_MIDNIGHT_NOT_ALLOWED"


def test_kind_category_constraints(client) -> None:
    trip = _create_trip(client)
    missing_category = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:00",
            "kind": "activity",
            "title": "缺分类",
        },
    )
    assert missing_category.status_code == 422

    transport_with_category = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:00",
            "kind": "transport",
            "category": "place",
            "title": "交通",
        },
    )
    assert transport_with_category.status_code == 422


def test_list_patch_delete_item(client) -> None:
    trip = _create_trip(client)
    created = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:00",
            "kind": "activity",
            "category": "place",
            "title": "城墙",
        },
    ).json()["data"]

    listed = client.get(f"/api/trips/{trip['id']}/items", params={"date": "2026-10-01"})
    assert listed.status_code == 200
    assert len(listed.json()["data"]) == 1

    patched = client.patch(
        f"/api/items/{created['id']}",
        json={"title": "西安城墙"},
    )
    assert patched.status_code == 200
    assert patched.json()["data"]["title"] == "西安城墙"

    deleted = client.delete(f"/api/items/{created['id']}")
    assert deleted.status_code == 200
    assert deleted.json()["data"]["ok"] is True
