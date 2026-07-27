"""Unit tests for AI plan nearest-neighbor fallback helpers."""

from __future__ import annotations

from decimal import Decimal

from app.models.place import Place
from app.services.ai_plan import build_stops_from_places, nearest_neighbor_order


def _place(pid: str, name: str, lng: float, lat: float) -> Place:
    return Place(
        id=pid,
        trip_id="t1",
        name=name,
        lng=Decimal(str(lng)),
        lat=Decimal(str(lat)),
    )


def test_nearest_neighbor_order():
    places = [
        _place("b", "B", 2.0, 0.0),
        _place("c", "C", 3.0, 0.0),
        _place("a", "A", 1.0, 0.0),
    ]
    ordered = nearest_neighbor_order(places, 0.0, 0.0)
    assert [p.id for p in ordered] == ["a", "b", "c"]


def test_build_stops_from_places():
    places = [_place("a", "塔", 113.0, 23.0), _place("b", "祠", 113.1, 23.1)]
    stops = build_stops_from_places(places, day_start="09:00", day_end="18:00", preferred_duration=60)
    assert len(stops) == 2
    assert stops[0].start_time == "09:00"
    assert stops[0].end_time == "10:00"
    assert stops[1].order == 2
