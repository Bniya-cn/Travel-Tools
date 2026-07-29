PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS places (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  amap_poi_id TEXT,
  name TEXT NOT NULL,
  address TEXT,
  city_name TEXT,
  district TEXT,
  lng REAL NOT NULL,
  lat REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (trip_id, amap_poi_id)
);
CREATE INDEX IF NOT EXISTS idx_places_trip_id ON places(trip_id);

CREATE TABLE IF NOT EXISTS itinerary_items (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  is_all_day INTEGER NOT NULL DEFAULT 0 CHECK (is_all_day IN (0, 1)),
  kind TEXT NOT NULL CHECK (kind IN ('activity', 'transport')),
  category TEXT CHECK (category IN ('place', 'meal', 'hotel', 'rest', 'custom')),
  title TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_trip_date_sort ON itinerary_items(trip_id, date, sort_order, start_time);
CREATE INDEX IF NOT EXISTS idx_items_place_id ON itinerary_items(place_id);

CREATE TABLE IF NOT EXISTS trip_places (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  place_id TEXT NOT NULL REFERENCES places(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'selected', 'planned', 'removed')),
  order_index INTEGER NOT NULL DEFAULT 0,
  preferred_duration INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (trip_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_places_trip_order ON trip_places(trip_id, order_index);

CREATE TABLE IF NOT EXISTS route_plan_drafts (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('ai', 'manual')),
  stops_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_trip_date ON route_plan_drafts(trip_id, date);

CREATE TABLE IF NOT EXISTS route_caches (
  id TEXT PRIMARY KEY,
  cache_key TEXT NOT NULL UNIQUE,
  route_type TEXT NOT NULL,
  strategy INTEGER NOT NULL DEFAULT 0,
  origin_lng REAL NOT NULL,
  origin_lat REAL NOT NULL,
  destination_lng REAL NOT NULL,
  destination_lat REAL NOT NULL,
  city1 TEXT,
  city2 TEXT,
  nightflag INTEGER NOT NULL DEFAULT 0,
  date TEXT NOT NULL,
  time_bucket TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'amap',
  provider_version TEXT NOT NULL DEFAULT 'v5',
  normalized_response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_hit_at TEXT,
  hit_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_route_caches_expires_at ON route_caches(expires_at);

CREATE TABLE IF NOT EXISTS route_segments (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  transport_item_id TEXT NOT NULL UNIQUE REFERENCES itinerary_items(id) ON DELETE RESTRICT,
  after_item_id TEXT NOT NULL REFERENCES itinerary_items(id) ON DELETE RESTRICT,
  before_item_id TEXT NOT NULL REFERENCES itinerary_items(id) ON DELETE RESTRICT,
  origin_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  destination_place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
  origin_name TEXT NOT NULL,
  origin_lng REAL NOT NULL,
  origin_lat REAL NOT NULL,
  destination_name TEXT NOT NULL,
  destination_lng REAL NOT NULL,
  destination_lat REAL NOT NULL,
  route_type TEXT NOT NULL,
  strategy INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL,
  distance_meters INTEGER NOT NULL DEFAULT 0,
  walking_distance_meters INTEGER,
  transfer_count INTEGER NOT NULL DEFAULT 0,
  polyline_json TEXT,
  steps_json TEXT,
  provider TEXT NOT NULL DEFAULT 'amap',
  provider_version TEXT NOT NULL DEFAULT 'v5',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (trip_id, after_item_id, before_item_id)
);
CREATE INDEX IF NOT EXISTS idx_route_segments_trip_id ON route_segments(trip_id);
