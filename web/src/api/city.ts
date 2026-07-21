import { apiGet } from './client';

export type CityCenter = {
  city_name: string;
  lng: number;
  lat: number;
};

export type CityHints = {
  city_name: string;
  title_placeholder: string;
  search_placeholder: string;
  source: 'ai' | 'fallback';
};

export function fetchCityCenter(city: string): Promise<CityCenter> {
  return apiGet<CityCenter>(`/api/geo/city-center?city=${encodeURIComponent(city)}`);
}

export function fetchCityHints(city: string): Promise<CityHints> {
  return apiGet<CityHints>(`/api/city-hints?city=${encodeURIComponent(city)}`);
}
