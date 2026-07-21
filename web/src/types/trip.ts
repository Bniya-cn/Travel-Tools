export type ItemKind = 'activity' | 'transport';
export type ItemCategory = 'place' | 'meal' | 'hotel' | 'rest' | 'custom';

export interface Trip {
  id: string;
  name: string;
  city_name: string;
  timezone: string;
  start_date: string;
  end_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  items_count?: number | null;
}

export interface TripCreateInput {
  name: string;
  city_name: string;
  timezone?: string;
  start_date: string;
  end_date: string;
  notes?: string | null;
}

export interface ItineraryItem {
  id: string;
  trip_id: string;
  place_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  is_all_day: boolean;
  kind: ItemKind;
  category: ItemCategory | null;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  place?: import('./place').Place | null;
}

export interface ItemCreateInput {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
  is_all_day?: boolean;
  kind?: ItemKind;
  category?: ItemCategory | null;
  title: string;
  description?: string | null;
  sort_order?: number;
  place_id?: string | null;
}
