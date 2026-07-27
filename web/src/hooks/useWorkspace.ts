import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addTripPlace,
  aiPlanDay,
  confirmDraft,
  generateDraftRoutes,
  getPlanDraft,
  listTripPlaces,
  putPlanDraft,
  updateTripPlace,
} from '../api/workspace';
import type { DraftStop, TripPlaceStatus } from '../types/workspace';

export function useTripPlaces(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip-places', tripId],
    queryFn: () => listTripPlaces(tripId!),
    enabled: Boolean(tripId),
  });
}

export function usePlanDraft(tripId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['plan-draft', tripId, date],
    queryFn: () => getPlanDraft(tripId!, date!),
    enabled: Boolean(tripId && date),
  });
}

export function useAddTripPlace(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => addTripPlace(tripId, placeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trip-places', tripId] });
      qc.invalidateQueries({ queryKey: ['places', tripId] });
    },
  });
}

export function useUpdateTripPlace(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      tripPlaceId: string;
      status?: TripPlaceStatus;
      order_index?: number;
      preferred_duration?: number | null;
    }) => updateTripPlace(tripId, args.tripPlaceId, args),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trip-places', tripId] }),
  });
}

export function useSavePlanDraft(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { date: string; stops: DraftStop[]; source?: 'ai' | 'manual' }) =>
      putPlanDraft(tripId, payload),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['plan-draft', tripId, vars.date] });
      qc.invalidateQueries({ queryKey: ['trip-places', tripId] });
    },
  });
}

export function useGenerateRoutes(tripId: string) {
  return useMutation({
    mutationFn: (args: { draftId: string; routeType?: 'transit' | 'walking' }) =>
      generateDraftRoutes(tripId, args.draftId, args.routeType ?? 'transit'),
  });
}

export function useConfirmDraft(tripId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { draftId: string; routeType?: 'transit' | 'walking' }) =>
      confirmDraft(tripId, args.draftId, args.routeType ?? 'transit'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['plan-draft', tripId, date] });
      qc.invalidateQueries({ queryKey: ['trip-places', tripId] });
      qc.invalidateQueries({ queryKey: ['items', tripId] });
      qc.invalidateQueries({ queryKey: ['route-segments', tripId, date] });
    },
  });
}

export function useAiPlan(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      date: string;
      place_ids: string[];
      day_start?: string;
      day_end?: string;
    }) => aiPlanDay(tripId, payload),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['plan-draft', tripId, vars.date] });
    },
  });
}
