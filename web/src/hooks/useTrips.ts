import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTrip, deleteTrip, getTrip, listTrips, updateTrip } from '../api/trips';
import type { TripCreateInput } from '../types/trip';

export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: listTrips,
  });
}

export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trips', tripId],
    queryFn: () => getTrip(tripId!),
    enabled: Boolean(tripId),
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: TripCreateInput) => createTrip(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}

export function useUpdateTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<TripCreateInput>) => updateTrip(tripId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trips'] });
      qc.invalidateQueries({ queryKey: ['trips', tripId] });
    },
  });
}

export function useDeleteTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => deleteTrip(tripId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trips'] }),
  });
}
