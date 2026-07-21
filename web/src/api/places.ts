import { apiGet, apiSend, http } from './client';
import type { Place, PlaceCreateInput, PlaceSearchResult } from '../types/place';

export function searchPlaces(keyword: string, cityCode: string) {
  return apiGet<PlaceSearchResult[]>(
    `/api/places/search?keyword=${encodeURIComponent(keyword)}&city_code=${encodeURIComponent(cityCode)}`,
  );
}

export function listPlaces(tripId: string) {
  return apiGet<Place[]>(`/api/trips/${tripId}/places`);
}

export function createPlace(tripId: string, payload: PlaceCreateInput) {
  return apiSend<Place>('post', `/api/trips/${tripId}/places`, payload);
}

export function updatePlace(placeId: string, payload: Partial<PlaceCreateInput>) {
  return apiSend<Place>('patch', `/api/places/${placeId}`, payload);
}

export function deletePlace(placeId: string) {
  return apiSend<{ ok: boolean }>('delete', `/api/places/${placeId}`);
}

/** Health-style check that API base is reachable (optional). */
export async function pingApi(): Promise<boolean> {
  try {
    await http.get('/health');
    return true;
  } catch {
    return false;
  }
}
