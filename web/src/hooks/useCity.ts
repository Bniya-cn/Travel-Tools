import { useQuery } from '@tanstack/react-query';
import { fetchCityCenter, fetchCityHints } from '../api/city';

export function useCityCenter(cityName: string | undefined) {
  return useQuery({
    queryKey: ['city-center', cityName],
    queryFn: () => fetchCityCenter(cityName!),
    enabled: Boolean(cityName?.trim()),
    staleTime: 24 * 60 * 60_000,
    retry: 1,
  });
}

export function useCityHints(cityName: string | undefined) {
  return useQuery({
    queryKey: ['city-recommendations', cityName],
    queryFn: () => fetchCityHints(cityName!),
    enabled: Boolean(cityName?.trim()),
    staleTime: 60 * 60_000,
    retry: 1,
  });
}
