import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRouteSegment,
  deleteRouteSegment,
  listTripRouteSegments,
  previewRoute,
} from '../api/routes';
import type { RouteSegmentCreateInput, RouteType } from '../types/route';

export function useRoutePreview(
  routeType: RouteType,
  afterItemId: string | null,
  beforeItemId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['route-preview', routeType, afterItemId, beforeItemId],
    queryFn: () => previewRoute(routeType, afterItemId!, beforeItemId!),
    enabled: enabled && Boolean(afterItemId && beforeItemId),
    staleTime: 30_000,
  });
}

export function useTripRouteSegments(tripId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['route-segments', tripId, date],
    queryFn: () => listTripRouteSegments(tripId!, date),
    enabled: Boolean(tripId && date),
  });
}

export function useTransitPreview(afterId: string | null, beforeId: string | null, enabled: boolean) {
  return useRoutePreview('transit', afterId, beforeId, enabled);
}

export function useWalkingPreview(afterId: string | null, beforeId: string | null, enabled: boolean) {
  return useRoutePreview('walking', afterId, beforeId, enabled);
}

export function useCreateRouteSegment(tripId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: RouteSegmentCreateInput) => createRouteSegment(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', tripId, date] });
      qc.invalidateQueries({ queryKey: ['route-segments', tripId, date] });
    },
  });
}

export function useDeleteRouteSegment(tripId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (segmentId: string) => deleteRouteSegment(segmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', tripId, date] });
      qc.invalidateQueries({ queryKey: ['route-segments', tripId, date] });
    },
  });
}
