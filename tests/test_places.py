"""Place CRUD and trip-scoping tests."""

from __future__ import annotations


def _create_trip(client, **overrides):
    payload = {
        "name": "西安五日游",
        "city_name": "西安",
                "start_date": "2026-10-01",
        "end_date": "2026-10-05",
    }
    payload.update(overrides)
    res = client.post("/api/trips", json=payload)
    assert res.status_code == 201
    return res.json()["data"]


def _create_place(client, trip_id: str, **overrides):
    payload = {
        "name": "陕西历史博物馆",
        "amap_poi_id": "B000A7BD6C",
        "address": "西安市雁塔区",
        "city_name": "西安市",
                "district": "雁塔区",
        "lng": 108.9599,
        "lat": 34.2195,
    }
    payload.update(overrides)
    res = client.post(f"/api/trips/{trip_id}/places", json=payload)
    assert res.status_code == 201
    return res.json()["data"]


def test_create_and_list_place(client) -> None:
    trip = _create_trip(client)
    place = _create_place(client, trip["id"])
    assert place["name"] == "陕西历史博物馆"
    listed = client.get(f"/api/trips/{trip['id']}/places")
    assert listed.status_code == 200
    assert len(listed.json()["data"]) == 1


def test_delete_place_ok(client) -> None:
    trip = _create_trip(client)
    place = _create_place(client, trip["id"])
    res = client.delete(f"/api/places/{place['id']}")
    assert res.status_code == 200
    assert res.json()["data"]["ok"] is True


def test_delete_place_in_use(client) -> None:
    trip = _create_trip(client)
    place = _create_place(client, trip["id"])
    item = client.post(
        f"/api/trips/{trip['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "11:00",
            "kind": "activity",
            "category": "place",
            "title": "逛博物馆",
            "place_id": place["id"],
        },
    )
    assert item.status_code == 201
    assert item.json()["data"]["place"]["id"] == place["id"]

    res = client.delete(f"/api/places/{place['id']}")
    assert res.status_code == 409
    assert res.json()["error"]["code"] == "PLACE_IN_USE"


def test_item_cannot_use_other_trip_place(client) -> None:
    trip_a = _create_trip(client, name="A")
    trip_b = _create_trip(client, name="B")
    place_b = _create_place(client, trip_b["id"], amap_poi_id="OTHER")

    res = client.post(
        f"/api/trips/{trip_a['id']}/items",
        json={
            "date": "2026-10-01",
            "start_time": "09:00",
            "end_time": "10:00",
            "kind": "activity",
            "category": "place",
            "title": "跨旅行地点",
            "place_id": place_b["id"],
        },
    )
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "PLACE_TRIP_MISMATCH"


def test_idempotent_create_by_amap_poi(client) -> None:
    trip = _create_trip(client)
    first = _create_place(client, trip["id"])
    second = _create_place(client, trip["id"])
    assert first["id"] == second["id"]
