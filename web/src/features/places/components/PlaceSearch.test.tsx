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

function renderSearch() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onPlaceSaved = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <PlaceSearch tripId="t1" cityCode="029" onPlaceSaved={onPlaceSaved} />
    </QueryClientProvider>,
  );
  return { onPlaceSaved };
}

describe('PlaceSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading then empty results', async () => {
    const user = userEvent.setup();
    let resolveSearch!: (v: PlaceSearchResult[]) => void;
    vi.mocked(placesApi.searchPlaces).mockImplementation(
      () =>
        new Promise<PlaceSearchResult[]>((resolve) => {
          resolveSearch = resolve;
        }),
    );

    renderSearch();
    await user.type(screen.getByPlaceholderText(/兵马俑/), '兵马俑');
    await waitFor(() => expect(screen.getByText('搜索中…')).toBeInTheDocument());

    resolveSearch([]);
    await waitFor(() => expect(screen.getByText('无搜索结果')).toBeInTheDocument());
  });
});
