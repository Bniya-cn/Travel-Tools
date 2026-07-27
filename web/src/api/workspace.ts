import { apiGet, apiSend } from './client';
import type {
  ConfirmDraftResult,
  DraftStop,
  GenerateRoutesResult,
  RoutePlanDraft,
  TripPlace,
  TripPlaceStatus,
} from '../types/workspace';

export function listTripPlaces(tripId: string): Promise<TripPlace[]> {
  return apiGet<TripPlace[]>(`/api/trips/${tripId}/trip-places`);
}

export function addTripPlace(
  tripId: string,
  placeId: string,
  preferredDuration?: number,
): Promise<TripPlace> {
  return apiSend<TripPlace>('post', `/api/trips/${tripId}/trip-places`, {
    place_id: placeId,
    preferred_duration: preferredDuration ?? null,
  });
}

export function updateTripPlace(
  tripId: string,
  tripPlaceId: string,
  payload: {
    status?: TripPlaceStatus;
    order_index?: number;
    preferred_duration?: number | null;
    notes?: string | null;
  },
): Promise<TripPlace> {
  return apiSend<TripPlace>('patch', `/api/trips/${tripId}/trip-places/${tripPlaceId}`, payload);
}

export function getPlanDraft(tripId: string, date: string): Promise<RoutePlanDraft | null> {
  return apiGet<RoutePlanDraft | null>(
    `/api/trips/${tripId}/plan-drafts?date=${encodeURIComponent(date)}`,
  );
}

export function putPlanDraft(
  tripId: string,
  payload: { date: string; source?: 'ai' | 'manual'; stops: DraftStop[] },
): Promise<RoutePlanDraft> {
  return apiSend<RoutePlanDraft>('put', `/api/trips/${tripId}/plan-drafts`, {
    source: 'manual',
    ...payload,
  });
}

export function generateDraftRoutes(
  tripId: string,
  draftId: string,
  routeType: 'transit' | 'walking' = 'transit',
): Promise<GenerateRoutesResult> {
  return apiSend<GenerateRoutesResult>(
    'post',
    `/api/trips/${tripId}/plan-drafts/${draftId}/generate-routes?route_type=${routeType}`,
  );
}

export function confirmDraft(
  tripId: string,
  draftId: string,
  routeType: 'transit' | 'walking' = 'transit',
): Promise<ConfirmDraftResult> {
  return apiSend<ConfirmDraftResult>(
    'post',
    `/api/trips/${tripId}/plan-drafts/${draftId}/confirm?route_type=${routeType}`,
  );
}

export function aiPlanDay(
  tripId: string,
  payload: {
    date: string;
    place_ids: string[];
    day_start?: string;
    day_end?: string;
    preferences?: string[];
  },
): Promise<RoutePlanDraft> {
  return apiSend<RoutePlanDraft>('post', `/api/trips/${tripId}/ai-plan`, {
    day_start: '09:00',
    day_end: '21:00',
    preferences: [],
    ...payload,
  });
}
