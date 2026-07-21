import { apiGet, apiSend } from './client';
import type { ItemCreateInput, ItineraryItem, Trip, TripCreateInput } from '../types/trip';

export function listTrips() {
  return apiGet<Trip[]>('/api/trips');
}

export function getTrip(tripId: string) {
  return apiGet<Trip>(`/api/trips/${tripId}`);
}

export function createTrip(payload: TripCreateInput) {
  return apiSend<Trip>('post', '/api/trips', payload);
}

export function updateTrip(tripId: string, payload: Partial<TripCreateInput>) {
  return apiSend<Trip>('patch', `/api/trips/${tripId}`, payload);
}

export function deleteTrip(tripId: string) {
  return apiSend<{ ok: boolean }>('delete', `/api/trips/${tripId}`);
}

export function listItems(tripId: string, date?: string) {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiGet<ItineraryItem[]>(`/api/trips/${tripId}/items${query}`);
}

export function createItem(tripId: string, payload: ItemCreateInput) {
  return apiSend<ItineraryItem>('post', `/api/trips/${tripId}/items`, payload);
}

export function updateItem(itemId: string, payload: Partial<ItemCreateInput>) {
  return apiSend<ItineraryItem>('patch', `/api/items/${itemId}`, payload);
}

export function deleteItem(itemId: string) {
  return apiSend<{ ok: boolean }>('delete', `/api/items/${itemId}`);
}
