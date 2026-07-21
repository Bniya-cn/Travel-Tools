export type Place = {
  id: string;
  trip_id: string;
  amap_poi_id: string | null;
  name: string;
  address: string | null;
  city_name: string | null;
  district: string | null;
  lng: number | string;
  lat: number | string;
  created_at: string;
  updated_at: string;
};

export type PlaceSearchResult = {
  name: string;
  address: string | null;
  city_name: string | null;
  district: string | null;
  lng: number;
  lat: number;
  amap_poi_id: string | null;
};

export type PlaceCreateInput = {
  name: string;
  amap_poi_id?: string | null;
  address?: string | null;
  city_name?: string | null;
  district?: string | null;
  lng: number;
  lat: number;
};

export function toLngLat(place: { lng: number | string; lat: number | string }): {
  lng: number;
  lat: number;
} {
  return { lng: Number(place.lng), lat: Number(place.lat) };
}
