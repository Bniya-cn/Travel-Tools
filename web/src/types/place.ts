export interface Place {
  id: string;
  trip_id: string;
  amap_poi_id: string | null;
  name: string;
  address: string | null;
  city_name: string | null;
  city_code: string | null;
  district: string | null;
  lng: number | string;
  lat: number | string;
  created_at: string;
  updated_at: string;
}

export interface PlaceSearchResult {
  name: string;
  address: string | null;
  city_name: string | null;
  city_code: string | null;
  district: string | null;
  lng: number;
  lat: number;
  amap_poi_id: string | null;
}

export interface PlaceCreateInput {
  name: string;
  amap_poi_id?: string | null;
  address?: string | null;
  city_name?: string | null;
  city_code?: string | null;
  district?: string | null;
  lng: number;
  lat: number;
}

export function toLngLat(place: Pick<Place, 'lng' | 'lat'>): { lng: number; lat: number } {
  return {
    lng: typeof place.lng === 'string' ? Number(place.lng) : place.lng,
    lat: typeof place.lat === 'string' ? Number(place.lat) : place.lat,
  };
}
