import { apiGet, apiSend } from './client';
import type {
  RoutePreviewResponse,
  RouteSegment,
  RouteSegmentCreateInput,
  RouteType,
} from '../types/route';

export function previewRoute(
  routeType: RouteType,
  afterItemId: string,
  beforeItemId: string,
  strategy?: number,
) {
  return apiSend<RoutePreviewResponse>('post', `/api/routes/${routeType}/preview`, {
    after_item_id: afterItemId,
    before_item_id: beforeItemId,
    strategy: strategy ?? null,
  });
}

export function listTripRouteSegments(tripId: string, date?: string) {
  const qs = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiGet<RouteSegment[]>(`/api/trips/${tripId}/route-segments${qs}`);
}

export function createRouteSegment(payload: RouteSegmentCreateInput) {
  return apiSend<RouteSegment>('post', '/api/routes/segments', payload);
}

export function deleteRouteSegment(segmentId: string) {
  return apiSend<{ ok: boolean }>('delete', `/api/routes/segments/${segmentId}`);
}
