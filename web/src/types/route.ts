export type RouteType = 'transit' | 'walking';

/** Polyline contract: [lng, lat][] */
export type LngLatTuple = [number, number];

export interface RouteStep {
  instruction: string | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  mode: string | null;
}

export interface RouteDTO {
  route_type: RouteType;
  strategy: number;
  duration_seconds: number;
  distance_meters: number;
  walking_distance_meters: number | null;
  transfer_count: number;
  polyline: LngLatTuple[];
  steps: RouteStep[];
  provider: string;
  provider_version: string;
}

export interface RoutePreviewResponse {
  route: RouteDTO;
  cache_hit: boolean;
  preview_token: string;
}

export interface RouteSegmentCreateInput {
  after_item_id: string;
  before_item_id: string;
  route_type: RouteType;
  strategy?: number | null;
  preview_token: string;
}

export interface RouteSegment {
  id: string;
  trip_id: string;
  transport_item_id: string;
  after_item_id: string;
  before_item_id: string;
  origin_name: string;
  destination_name: string;
  route_type: string;
  strategy: number;
  duration_seconds: number;
  distance_meters: number;
  walking_distance_meters: number | null;
  transfer_count: number;
  polyline_json: LngLatTuple[] | null;
}
