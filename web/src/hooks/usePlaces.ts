import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createPlace, deletePlace, listPlaces, searchPlaces } from '../api/places';
import type { PlaceCreateInput } from '../types/place';

export function usePlaces(tripId: string | undefined) {
  return useQuery({
    queryKey: ['places', tripId],
    queryFn: () => listPlaces(tripId!),
    enabled: Boolean(tripId),
  });
}

export function usePlaceSearch(keyword: string, city: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['place-search', city, keyword],
    queryFn: () => searchPlaces(keyword, city!),
    enabled: enabled && Boolean(city) && keyword.trim().length > 0,
    staleTime: 30_000,
  });
}

export function useCreatePlace(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PlaceCreateInput) => createPlace(tripId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['places', tripId] });
    },
  });
}

export function useDeletePlace(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (placeId: string) => deletePlace(placeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['places', tripId] });
    },
  });
}
