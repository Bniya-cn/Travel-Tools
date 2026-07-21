import { apiGet, apiSend } from './client';
import type { Place, PlaceCreateInput, PlaceSearchResult } from '../types/place';

export function searchPlaces(keyword: string, city: string) {
  return apiGet<PlaceSearchResult[]>(
    `/api/places/search?keyword=${encodeURIComponent(keyword)}&city=${encodeURIComponent(city)}`,
  );
}

export function listPlaces(tripId: string) {
  return apiGet<Place[]>(`/api/trips/${tripId}/places`);
}

export function createPlace(tripId: string, payload: PlaceCreateInput) {
  return apiSend<Place>('post', `/api/trips/${tripId}/places`, payload);
}

export function deletePlace(placeId: string) {
  return apiSend<{ ok: boolean }>('delete', `/api/places/${placeId}`);
}
