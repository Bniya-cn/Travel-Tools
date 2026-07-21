"""Unit tests for half-open conflict helper."""

from __future__ import annotations

from datetime import time
from types import SimpleNamespace

from app.services.conflict import check_time_conflict, intervals_overlap


def test_adjacent_not_overlap() -> None:
    assert not intervals_overlap(time(9, 0), time(10, 0), time(10, 0), time(11, 0))


def test_partial_overlap() -> None:
    assert intervals_overlap(time(9, 0), time(10, 30), time(10, 0), time(11, 0))


def test_containment_overlap() -> None:
    assert intervals_overlap(time(9, 0), time(12, 0), time(10, 0), time(11, 0))


def test_all_day_ignored() -> None:
    existing = [
        SimpleNamespace(id="1", is_all_day=True, start_time=None, end_time=None, title="保险"),
    ]
    assert check_time_conflict(start_time=time(9, 0), end_time=time(10, 0), existing_items=existing) is None
