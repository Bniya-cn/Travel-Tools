import type { Place } from './place';
import type { RouteDTO } from './route';

export type TripPlaceStatus = 'candidate' | 'selected' | 'planned' | 'removed';

export type TripPlace = {
  id: string;
  trip_id: string;
  place_id: string;
  status: TripPlaceStatus;
  order_index: number;
  preferred_duration: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  place: Place | null;
};

export type DraftStop = {
  place_id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  order: number;
  preferred_duration_minutes?: number | null;
};

export type RoutePlanDraft = {
  id: string;
  trip_id: string;
  date: string;
  source: 'ai' | 'manual';
  stops: DraftStop[];
  status: 'draft' | 'confirmed' | 'cancelled';
  created_at: string;
  updated_at: string;
};

export type DraftRouteSegmentPreview = {
  from_place_id: string;
  to_place_id: string;
  from_order: number;
  to_order: number;
  route: RouteDTO;
  preview_token: string;
  cache_hit: boolean;
  time_conflict: boolean;
  available_duration_seconds: number | null;
};

export type GenerateRoutesResult = {
  draft_id: string;
  segments: DraftRouteSegmentPreview[];
};

export type ConfirmDraftResult = {
  draft: RoutePlanDraft;
  item_ids: string[];
  segment_ids: string[];
};
