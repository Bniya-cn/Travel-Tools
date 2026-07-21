import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createItem, deleteItem, listItems, updateItem } from '../api/trips';
import type { ItemCreateInput } from '../types/trip';

export function useItems(tripId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['items', tripId, date],
    queryFn: () => listItems(tripId!, date),
    enabled: Boolean(tripId && date),
  });
}

export function useCreateItem(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ItemCreateInput) => createItem(tripId, payload),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['items', tripId, variables.date] });
      qc.invalidateQueries({ queryKey: ['trips', tripId] });
      qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}

export function useUpdateItem(tripId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, payload }: { itemId: string; payload: Partial<ItemCreateInput> }) =>
      updateItem(itemId, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', tripId, date] });
    },
  });
}

export function useDeleteItem(tripId: string, date: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items', tripId, date] });
      qc.invalidateQueries({ queryKey: ['trips', tripId] });
      qc.invalidateQueries({ queryKey: ['trips'] });
    },
  });
}
