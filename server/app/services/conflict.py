"""Half-open interval conflict detection for timed itinerary items."""

from __future__ import annotations

from datetime import time

from app.models.itinerary_item import ItineraryItem


def intervals_overlap(a_start: time, a_end: time, b_start: time, b_end: time) -> bool:
    """Return True if [a_start, a_end) overlaps [b_start, b_end)."""
    return a_start < b_end and b_start < a_end


def check_time_conflict(
    *,
    start_time: time,
    end_time: time,
    existing_items: list[ItineraryItem],
    exclude_item_id: str | None = None,
) -> ItineraryItem | None:
    """
    Check timed item against existing same-day items.

    All-day items are ignored. Returns the first conflicting item, or None.
    """
    for item in existing_items:
        if exclude_item_id and item.id == exclude_item_id:
            continue
        if item.is_all_day:
            continue
        if item.start_time is None or item.end_time is None:
            continue
        if intervals_overlap(start_time, end_time, item.start_time, item.end_time):
            return item
    return None
