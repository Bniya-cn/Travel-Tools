import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PlaceSearch } from './PlaceSearch';
import * as placesApi from '../../../api/places';
import type { PlaceSearchResult } from '../../../types/place';

vi.mock('../../../api/places', () => ({
  searchPlaces: vi.fn(),
  createPlace: vi.fn(),
  listPlaces: vi.fn(),
  deletePlace: vi.fn(),
}));

const recommended: PlaceSearchResult[] = [
  {
    name: '中山大学',
    address: '广州市海珠区新港西路135号',
    city_name: '广州市',
    district: '海珠区',
    lng: 113.3,
    lat: 23.1,
    amap_poi_id: 'B001',
  },
];

function renderSearch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onPlaceSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PlaceSearch
        tripId="t1"
        cityName="广州"
        recommendedPlaces={recommended}
        onPlaceSaved={onPlaceSaved}
      />
    </QueryClientProvider>,
  );
  return { onPlaceSaved };
}

describe('PlaceSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows recommended places on entry', () => {
    renderSearch();
    expect(screen.getByText('推荐地点')).toBeInTheDocument();
    expect(screen.getByText('中山大学')).toBeInTheDocument();
    expect(screen.getByText(/海珠区/)).toBeInTheDocument();
  });

  it('shows loading then empty search results', async () => {
    const user = userEvent.setup();
    let resolveSearch!: (v: PlaceSearchResult[]) => void;
    vi.mocked(placesApi.searchPlaces).mockImplementation(
      () =>
        new Promise<PlaceSearchResult[]>((resolve) => {
          resolveSearch = resolve;
        }),
    );

    renderSearch();
    await user.type(screen.getByPlaceholderText(/输入地点名称/), '博物馆');
    await waitFor(() => expect(screen.getByText('搜索中…')).toBeInTheDocument());

    resolveSearch([]);
    await waitFor(() => expect(screen.getByText('无搜索结果')).toBeInTheDocument());
  });
});
