import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TimelineItem } from './TimelineItem';
import type { ItineraryItem } from '../../../types/trip';

const item: ItineraryItem = {
  id: 'i1',
  trip_id: 't1',
  date: '2026-10-01',
  start_time: '09:00:00',
  end_time: '11:00:00',
  is_all_day: false,
  kind: 'activity',
  category: 'place',
  title: '逛博物馆',
  description: null,
  sort_order: 0,
  place_id: 'p1',
  place: {
    id: 'p1',
    trip_id: 't1',
    amap_poi_id: 'B1',
    name: '陕西历史博物馆',
    address: '雁塔区',
    city_name: '西安',
    district: '雁塔区',
    lng: 108.9599,
    lat: 34.2195,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('TimelineItem place focus', () => {
  it('clicks place name to request map focus', async () => {
    const user = userEvent.setup();
    const onFocusPlace = vi.fn();
    render(
      <TimelineItem item={item} onDelete={vi.fn()} onFocusPlace={onFocusPlace} />,
    );
    await user.click(screen.getByRole('button', { name: /陕西历史博物馆/ }));
    expect(onFocusPlace).toHaveBeenCalledWith(item);
  });
});
