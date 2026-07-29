import { z } from 'zod';
import { cityCenter, route as amapRoute, searchPlaces, type Route } from './amap';
import { AppError, apiError, body, digest, hmac, id, now, ok, parseJson, stringParam, toNumber, type Env } from './runtime';

type Context = { request: Request; env: Env; params: { path?: string[] } };
type Row = Record<string, unknown>;

const tripInput = z.object({
  name: z.string().trim().min(1).max(100),
  city_name: z.string().trim().min(1).max(100),
  timezone: z.string().trim().min(1).max(50).default('Asia/Shanghai'),
  start_date: z.string().date(),
  end_date: z.string().date(),
  notes: z.string().nullable().optional(),
}).superRefine((value, context) => {
  if (value.end_date < value.start_date) context.addIssue({ code: 'custom', message: 'end_date 必须大于或等于 start_date', path: ['end_date'] });
});
const tripPatch = tripInput.partial();
const placeInput = z.object({ name: z.string().trim().min(1).max(200), amap_poi_id: z.string().max(100).nullable().optional(), address: z.string().max(500).nullable().optional(), city_name: z.string().max(100).nullable().optional(), district: z.string().max(100).nullable().optional(), lng: z.number().finite(), lat: z.number().finite() });
const placePatch = placeInput.partial();
const itemInput = z.object({ date: z.string().date(), start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(), end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(), is_all_day: z.boolean().default(false), kind: z.enum(['activity', 'transport']).default('activity'), category: z.enum(['place', 'meal', 'hotel', 'rest', 'custom']).nullable().optional(), title: z.string().trim().min(1).max(200), description: z.string().nullable().optional(), sort_order: z.number().int().default(0), place_id: z.string().uuid().nullable().optional() });
const draftStop = z.object({ place_id: z.string().uuid(), title: z.string().trim().min(1).max(200), start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(), order: z.number().int().min(1), preferred_duration_minutes: z.number().int().min(1).max(1440).nullable().optional() }).superRefine((value, context) => { if (value.start_time && value.end_time && value.end_time <= value.start_time) context.addIssue({ code: 'custom', message: 'end_time 必须晚于 start_time', path: ['end_time'] }); });
const draftInput = z.object({ date: z.string().date(), source: z.enum(['manual', 'ai']).default('manual'), stops: z.array(draftStop).default([]) });

function rows<T extends Row>(result: { results: T[] }): T[] { return result.results; }
async function all(env: Env, sql: string, ...params: unknown[]): Promise<Row[]> { return rows(await env.DB.prepare(sql).bind(...params).all()); }
async function one(env: Env, sql: string, ...params: unknown[]): Promise<Row | null> { return env.DB.prepare(sql).bind(...params).first(); }
async function run(env: Env, sql: string, ...params: unknown[]): Promise<void> { await env.DB.prepare(sql).bind(...params).run(); }
function dateInTrip(date: string, trip: Row): void { if (date < String(trip.start_date) || date > String(trip.end_date)) throw new AppError('VALIDATION_ERROR', '日期必须在旅行范围内', 422); }
function recordTrip(row: Row, itemsCount?: number): Row { return { ...row, items_count: itemsCount ?? row.items_count ?? null }; }
function recordPlace(row: Row): Row { return { ...row, lng: toNumber(row.lng), lat: toNumber(row.lat) }; }
function recordItem(row: Row): Row { return { ...row, is_all_day: Boolean(row.is_all_day), place: row.place_id ? { id: row.place_id, trip_id: row.place_trip_id, amap_poi_id: row.amap_poi_id, name: row.place_name, address: row.place_address, city_name: row.place_city_name, district: row.place_district, lng: row.place_lng === null ? null : toNumber(row.place_lng), lat: row.place_lat === null ? null : toNumber(row.place_lat), created_at: row.place_created_at, updated_at: row.place_updated_at } : null }; }
function routeFrom(row: Row): Route { return { route_type: String(row.route_type) as 'transit' | 'walking', strategy: toNumber(row.strategy), duration_seconds: toNumber(row.duration_seconds), distance_meters: toNumber(row.distance_meters), walking_distance_meters: row.walking_distance_meters === null ? null : toNumber(row.walking_distance_meters), transfer_count: toNumber(row.transfer_count), polyline: parseJson(row.polyline_json, []), steps: parseJson(row.steps_json, []), provider: String(row.provider ?? 'amap'), provider_version: String(row.provider_version ?? 'v5.1') }; }

async function tripOr404(env: Env, tripId: string): Promise<Row> { const trip = await one(env, 'SELECT * FROM trips WHERE id = ?', tripId); if (!trip) throw new AppError('NOT_FOUND', '旅行不存在', 404); return trip; }
async function placeOr404(env: Env, placeId: string): Promise<Row> { const place = await one(env, 'SELECT * FROM places WHERE id = ?', placeId); if (!place) throw new AppError('NOT_FOUND', '地点不存在', 404); return place; }
async function itemOr404(env: Env, itemId: string): Promise<Row> { const item = await one(env, 'SELECT * FROM itinerary_items WHERE id = ?', itemId); if (!item) throw new AppError('NOT_FOUND', '事项不存在', 404); return item; }
async function withItemPlace(env: Env, itemId: string): Promise<Row> { const item = await one(env, `SELECT i.*, p.trip_id AS place_trip_id, p.amap_poi_id, p.name AS place_name, p.address AS place_address, p.city_name AS place_city_name, p.district AS place_district, p.lng AS place_lng, p.lat AS place_lat, p.created_at AS place_created_at, p.updated_at AS place_updated_at FROM itinerary_items i LEFT JOIN places p ON p.id = i.place_id WHERE i.id = ?`, itemId); if (!item) throw new AppError('NOT_FOUND', '事项不存在', 404); return recordItem(item); }

async function signedPreview(env: Env, tripId: string, afterItemId: string, beforeItemId: string, route: Route): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + 600;
  const fingerprint = await digest(JSON.stringify(route));
  const payload = [tripId, afterItemId, beforeItemId, route.route_type, route.strategy, fingerprint, expires].join('|');
  const signature = await hmac(env.PREVIEW_TOKEN_SECRET || 'local-development-preview-secret', payload);
  return `${payload}|${signature}`;
}

async function verifyPreview(env: Env, token: string, tripId: string, afterItemId: string, beforeItemId: string, route: Route): Promise<void> {
  const parts = token.split('|');
  if (parts.length !== 8) throw new AppError('PREVIEW_TOKEN_INVALID', 'preview_token 无效', 422);
  const [tokenTrip, tokenAfter, tokenBefore, tokenType, tokenStrategy, fingerprint, expiry, signature] = parts;
  const payload = parts.slice(0, -1).join('|');
  const expected = await hmac(env.PREVIEW_TOKEN_SECRET || 'local-development-preview-secret', payload);
  if (signature !== expected || Number(expiry) < Math.floor(Date.now() / 1000)) throw new AppError('PREVIEW_TOKEN_INVALID', 'preview_token 无效或已过期', 422);
  if (tokenTrip !== tripId || tokenAfter !== afterItemId || tokenBefore !== beforeItemId || tokenType !== route.route_type || tokenStrategy !== String(route.strategy) || fingerprint !== await digest(JSON.stringify(route))) {
    throw new AppError('PREVIEW_TOKEN_INVALID', 'preview_token 与路线内容不匹配', 422);
  }
}

async function resolveRoute(env: Env, afterItemId: string, beforeItemId: string, kind: 'transit' | 'walking', strategy: number): Promise<{ trip: Row; after: Row; before: Row; route: Route; cacheHit: boolean }> {
  const after = await withItemPlace(env, afterItemId);
  const before = await withItemPlace(env, beforeItemId);
  if (after.trip_id !== before.trip_id) throw new AppError('VALIDATION_ERROR', '两个事项必须属于同一旅行', 422);
  if (!after.place_id || !before.place_id || after.place_lng === null || before.place_lng === null) throw new AppError('VALIDATION_ERROR', '路线两端必须关联地点', 422);
  const trip = await tripOr404(env, String(after.trip_id));
  const cacheKey = await digest([kind, strategy, after.place_lng, after.place_lat, before.place_lng, before.place_lat, trip.city_name].join('|'));
  const cached = await one(env, 'SELECT * FROM route_caches WHERE cache_key = ? AND expires_at > ?', cacheKey, now());
  if (cached) {
    await run(env, 'UPDATE route_caches SET hit_count = hit_count + 1, last_hit_at = ? WHERE id = ?', now(), cached.id);
    return { trip, after, before, route: parseJson(cached.normalized_response_json, {} as Route), cacheHit: true };
  }
  const route = await amapRoute(env, kind, [toNumber(after.place_lng), toNumber(after.place_lat)], [toNumber(before.place_lng), toNumber(before.place_lat)], strategy, String(trip.city_name));
  const created = now();
  await run(env, `INSERT INTO route_caches (id, cache_key, route_type, strategy, origin_lng, origin_lat, destination_lng, destination_lat, city1, city2, nightflag, date, time_bucket, provider, provider_version, normalized_response_json, created_at, expires_at, last_hit_at, hit_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'all', ?, ?, ?, ?, datetime(?, '+24 hours'), NULL, 0)`, id(), cacheKey, kind, strategy, after.place_lng, after.place_lat, before.place_lng, before.place_lat, trip.city_name, trip.city_name, String(after.date), route.provider, route.provider_version, JSON.stringify(route), created, created);
  return { trip, after, before, route, cacheHit: false };
}

async function listTrips(env: Env): Promise<Response> {
  const data = await all(env, `SELECT t.*, COUNT(i.id) AS items_count FROM trips t LEFT JOIN itinerary_items i ON i.trip_id = t.id GROUP BY t.id ORDER BY t.start_date DESC, t.created_at DESC`);
  return ok(data.map((row) => recordTrip(row, toNumber(row.items_count))));
}

async function trips(request: Request, env: Env, segments: string[]): Promise<Response> {
  const tripId = segments[1];
  if (!tripId) {
    if (request.method === 'GET') return listTrips(env);
    if (request.method === 'POST') {
      const data = await body(request, tripInput); const createdAt = now(); const trip = { id: id(), ...data, notes: data.notes ?? null, created_at: createdAt, updated_at: createdAt };
      await run(env, 'INSERT INTO trips (id, name, city_name, timezone, start_date, end_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', trip.id, trip.name, trip.city_name, trip.timezone, trip.start_date, trip.end_date, trip.notes, createdAt, createdAt);
      return ok(recordTrip(trip, 0), 201);
    }
    throw new AppError('NOT_FOUND', '接口不存在', 404);
  }
  if (segments.length === 2) {
    if (request.method === 'GET') { const trip = await tripOr404(env, tripId); const count = await one(env, 'SELECT COUNT(*) AS count FROM itinerary_items WHERE trip_id = ?', tripId); return ok(recordTrip(trip, toNumber(count?.count))); }
    if (request.method === 'PATCH') {
      const current = await tripOr404(env, tripId); const patch = await body(request, tripPatch); const next = { ...current, ...patch, notes: patch.notes === undefined ? current.notes : patch.notes };
      if (String(next.end_date) < String(next.start_date)) throw new AppError('VALIDATION_ERROR', 'end_date 必须大于或等于 start_date', 422);
      if (patch.start_date || patch.end_date) { const out = await one(env, 'SELECT COUNT(*) AS count FROM itinerary_items WHERE trip_id = ? AND (date < ? OR date > ?)', tripId, next.start_date, next.end_date); if (toNumber(out?.count)) throw new AppError('TRIP_DATE_RANGE_HAS_ITEMS', '缩短旅行日期失败：仍有事项落在新范围之外', 409, { outside_item_count: toNumber(out?.count) }); }
      if (patch.city_name && patch.city_name !== current.city_name) await run(env, 'DELETE FROM route_segments WHERE trip_id = ?', tripId);
      const updatedAt = now(); await run(env, 'UPDATE trips SET name = ?, city_name = ?, timezone = ?, start_date = ?, end_date = ?, notes = ?, updated_at = ? WHERE id = ?', next.name, next.city_name, next.timezone, next.start_date, next.end_date, next.notes, updatedAt, tripId);
      return ok(recordTrip({ ...next, id: tripId, updated_at: updatedAt }, toNumber((await one(env, 'SELECT COUNT(*) AS count FROM itinerary_items WHERE trip_id = ?', tripId))?.count)));
    }
    if (request.method === 'DELETE') { await tripOr404(env, tripId); await run(env, 'DELETE FROM route_segments WHERE trip_id = ?', tripId); await run(env, 'DELETE FROM trips WHERE id = ?', tripId); return ok({ ok: true }); }
  }
  if (segments[2] === 'items') return tripItems(request, env, tripId);
  if (segments[2] === 'places') return tripPlacesCrud(request, env, tripId);
  if (segments[2] === 'trip-places') return tripPlacePool(request, env, tripId, segments.slice(3));
  if (segments[2] === 'plan-drafts') return planDrafts(request, env, tripId, segments.slice(3));
  if (segments[2] === 'ai-plan' && request.method === 'POST') return aiPlan(request, env, tripId);
  if (segments[2] === 'route-segments' && request.method === 'GET') return routeSegments(env, tripId, new URL(request.url).searchParams.get('date'));
  throw new AppError('NOT_FOUND', '接口不存在', 404);
}

async function tripItems(request: Request, env: Env, tripId: string): Promise<Response> {
  const trip = await tripOr404(env, tripId);
  if (request.method === 'GET') {
    const date = new URL(request.url).searchParams.get('date');
    const data = await all(env, `SELECT i.*, p.trip_id AS place_trip_id, p.amap_poi_id, p.name AS place_name, p.address AS place_address, p.city_name AS place_city_name, p.district AS place_district, p.lng AS place_lng, p.lat AS place_lat, p.created_at AS place_created_at, p.updated_at AS place_updated_at FROM itinerary_items i LEFT JOIN places p ON p.id = i.place_id WHERE i.trip_id = ? ${date ? 'AND i.date = ?' : ''} ORDER BY i.date ASC, i.sort_order ASC, i.start_time ASC`, ...(date ? [tripId, date] : [tripId]));
    return ok(data.map(recordItem));
  }
  if (request.method !== 'POST') throw new AppError('NOT_FOUND', '接口不存在', 404);
  const data = await body(request, itemInput); dateInTrip(data.date, trip);
  if (!data.is_all_day && data.start_time && data.end_time && data.end_time <= data.start_time) throw new AppError('VALIDATION_ERROR', 'end_time 必须晚于 start_time', 422);
  if (data.place_id) { const place = await placeOr404(env, data.place_id); if (place.trip_id !== tripId) throw new AppError('PLACE_TRIP_MISMATCH', '地点不属于当前旅行', 422, { place_id: data.place_id, trip_id: tripId }); }
  if (!data.is_all_day && data.start_time && data.end_time) { const conflict = await one(env, `SELECT id, title FROM itinerary_items WHERE trip_id = ? AND date = ? AND is_all_day = 0 AND start_time < ? AND end_time > ? LIMIT 1`, tripId, data.date, data.end_time, data.start_time); if (conflict) throw new AppError('ITEM_TIME_CONFLICT', '该时间段与已有事项冲突', 409, { conflict_item_id: conflict.id, conflict_title: conflict.title }); }
  const createdAt = now(); const itemId = id(); await run(env, 'INSERT INTO itinerary_items (id, trip_id, place_id, date, start_time, end_time, is_all_day, kind, category, title, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', itemId, tripId, data.place_id ?? null, data.date, data.is_all_day ? null : data.start_time?.slice(0, 5) ?? null, data.is_all_day ? null : data.end_time?.slice(0, 5) ?? null, data.is_all_day ? 1 : 0, data.kind, data.category ?? null, data.title, data.description ?? null, data.sort_order, createdAt, createdAt);
  return ok(await withItemPlace(env, itemId), 201);
}

async function item(request: Request, env: Env, itemId: string): Promise<Response> {
  const current = await itemOr404(env, itemId);
  if (request.method === 'DELETE') { const transports = await all(env, 'SELECT transport_item_id FROM route_segments WHERE after_item_id = ? OR before_item_id = ?', itemId, itemId); await run(env, 'DELETE FROM route_segments WHERE after_item_id = ? OR before_item_id = ? OR transport_item_id = ?', itemId, itemId, itemId); for (const transport of transports) await run(env, 'DELETE FROM itinerary_items WHERE id = ?', transport.transport_item_id); await run(env, 'DELETE FROM itinerary_items WHERE id = ?', itemId); return ok({ ok: true }); }
  if (request.method !== 'PATCH') throw new AppError('NOT_FOUND', '接口不存在', 404);
  const patch = await body(request, itemInput.partial()); const trip = await tripOr404(env, String(current.trip_id)); const next = { ...current, ...patch }; dateInTrip(String(next.date), trip);
  if (patch.place_id) { const place = await placeOr404(env, patch.place_id); if (place.trip_id !== current.trip_id) throw new AppError('PLACE_TRIP_MISMATCH', '地点不属于当前旅行', 422); }
  const changedRouteSource = patch.place_id !== undefined || patch.start_time !== undefined || patch.end_time !== undefined || patch.date !== undefined;
  if (changedRouteSource) await run(env, 'DELETE FROM route_segments WHERE after_item_id = ? OR before_item_id = ?', itemId, itemId);
  const updatedAt = now(); await run(env, 'UPDATE itinerary_items SET place_id = ?, date = ?, start_time = ?, end_time = ?, is_all_day = ?, kind = ?, category = ?, title = ?, description = ?, sort_order = ?, updated_at = ? WHERE id = ?', next.place_id ?? null, next.date, next.is_all_day ? null : next.start_time?.slice(0, 5) ?? null, next.is_all_day ? null : next.end_time?.slice(0, 5) ?? null, next.is_all_day ? 1 : 0, next.kind, next.category ?? null, next.title, next.description ?? null, next.sort_order, updatedAt, itemId);
  return ok(await withItemPlace(env, itemId));
}

async function tripPlacesCrud(request: Request, env: Env, tripId: string): Promise<Response> {
  await tripOr404(env, tripId);
  if (request.method === 'GET') return ok((await all(env, 'SELECT * FROM places WHERE trip_id = ? ORDER BY created_at DESC', tripId)).map(recordPlace));
  if (request.method !== 'POST') throw new AppError('NOT_FOUND', '接口不存在', 404);
  const data = await body(request, placeInput); const existing = data.amap_poi_id ? await one(env, 'SELECT * FROM places WHERE trip_id = ? AND amap_poi_id = ?', tripId, data.amap_poi_id) : null;
  if (existing) { const membership = await one(env, 'SELECT * FROM trip_places WHERE trip_id = ? AND place_id = ?', tripId, existing.id); if (!membership) { const max = await one(env, 'SELECT MAX(order_index) AS max FROM trip_places WHERE trip_id = ?', tripId); await run(env, 'INSERT INTO trip_places (id, trip_id, place_id, status, order_index, preferred_duration, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)', id(), tripId, existing.id, 'candidate', toNumber(max?.max) + 1, now(), now()); } else if (membership.status === 'removed') await run(env, 'UPDATE trip_places SET status = ?, updated_at = ? WHERE id = ?', 'candidate', now(), membership.id); return ok(recordPlace(existing)); }
  const placeId = id(); const createdAt = now(); await run(env, 'INSERT INTO places (id, trip_id, amap_poi_id, name, address, city_name, district, lng, lat, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', placeId, tripId, data.amap_poi_id ?? null, data.name, data.address ?? null, data.city_name ?? null, data.district ?? null, data.lng, data.lat, createdAt, createdAt); const max = await one(env, 'SELECT MAX(order_index) AS max FROM trip_places WHERE trip_id = ?', tripId); await run(env, 'INSERT INTO trip_places (id, trip_id, place_id, status, order_index, preferred_duration, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?)', id(), tripId, placeId, 'candidate', toNumber(max?.max) + 1, createdAt, createdAt); return ok(recordPlace((await placeOr404(env, placeId))), 201);
}

async function place(request: Request, env: Env, placeId: string): Promise<Response> {
  const current = await placeOr404(env, placeId);
  if (request.method === 'DELETE') { const count = await one(env, 'SELECT COUNT(*) AS count FROM itinerary_items WHERE place_id = ?', placeId); if (toNumber(count?.count)) throw new AppError('PLACE_IN_USE', '地点仍被日程事项引用，无法删除', 409, { item_count: toNumber(count?.count) }); await run(env, 'DELETE FROM trip_places WHERE place_id = ?', placeId); await run(env, 'DELETE FROM places WHERE id = ?', placeId); return ok({ ok: true }); }
  if (request.method !== 'PATCH') throw new AppError('NOT_FOUND', '接口不存在', 404);
  const patch = await body(request, placePatch); const next = { ...current, ...patch }; await run(env, 'UPDATE places SET name = ?, address = ?, city_name = ?, district = ?, lng = ?, lat = ?, updated_at = ? WHERE id = ?', next.name, next.address ?? null, next.city_name ?? null, next.district ?? null, next.lng, next.lat, now(), placeId); return ok(recordPlace(await placeOr404(env, placeId)));
}

async function tripPlacePool(request: Request, env: Env, tripId: string, tail: string[]): Promise<Response> {
  await tripOr404(env, tripId); const poolId = tail[0];
  if (!poolId && request.method === 'GET') { const includeRemoved = new URL(request.url).searchParams.get('include_removed') === 'true'; const data = await all(env, `SELECT tp.*, p.id AS place_id_value, p.amap_poi_id, p.name AS place_name, p.address AS place_address, p.city_name AS place_city_name, p.district AS place_district, p.lng AS place_lng, p.lat AS place_lat, p.created_at AS place_created_at, p.updated_at AS place_updated_at FROM trip_places tp JOIN places p ON p.id = tp.place_id WHERE tp.trip_id = ? ${includeRemoved ? '' : "AND tp.status != 'removed'"} ORDER BY tp.order_index ASC, tp.created_at ASC`, tripId); return ok(data.map((row) => ({ ...row, place: recordPlace({ id: row.place_id_value, trip_id: tripId, amap_poi_id: row.amap_poi_id, name: row.place_name, address: row.place_address, city_name: row.place_city_name, district: row.place_district, lng: row.place_lng, lat: row.place_lat, created_at: row.place_created_at, updated_at: row.place_updated_at }) }))); }
  if (!poolId && request.method === 'POST') { const data = await body(request, z.object({ place_id: z.string().uuid(), preferred_duration: z.number().int().min(1).max(1440).nullable().optional(), notes: z.string().max(2000).nullable().optional() })); const place = await placeOr404(env, data.place_id); if (place.trip_id !== tripId) throw new AppError('PLACE_TRIP_MISMATCH', '地点不属于当前旅行', 422); const existing = await one(env, 'SELECT * FROM trip_places WHERE trip_id = ? AND place_id = ?', tripId, data.place_id); if (existing) return ok(existing); const max = await one(env, 'SELECT MAX(order_index) AS max FROM trip_places WHERE trip_id = ?', tripId); const created = { id: id(), trip_id: tripId, place_id: data.place_id, status: 'candidate', order_index: toNumber(max?.max) + 1, preferred_duration: data.preferred_duration ?? null, notes: data.notes ?? null, created_at: now(), updated_at: now() }; await run(env, 'INSERT INTO trip_places (id, trip_id, place_id, status, order_index, preferred_duration, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', created.id, created.trip_id, created.place_id, created.status, created.order_index, created.preferred_duration, created.notes, created.created_at, created.updated_at); return ok({ ...created, place: recordPlace(place) }, 201); }
  if (poolId && request.method === 'PATCH') { const data = await body(request, z.object({ status: z.enum(['candidate', 'selected', 'planned', 'removed']).optional(), order_index: z.number().int().min(0).optional(), preferred_duration: z.number().int().min(1).max(1440).nullable().optional(), notes: z.string().max(2000).nullable().optional() })); const current = await one(env, 'SELECT * FROM trip_places WHERE id = ? AND trip_id = ?', poolId, tripId); if (!current) throw new AppError('NOT_FOUND', '地点池条目不存在', 404); const next = { ...current, ...data }; await run(env, 'UPDATE trip_places SET status = ?, order_index = ?, preferred_duration = ?, notes = ?, updated_at = ? WHERE id = ?', next.status, next.order_index, next.preferred_duration, next.notes, now(), poolId); return ok({ ...next, updated_at: now() }); }
  throw new AppError('NOT_FOUND', '接口不存在', 404);
}

function draftResponse(row: Row): Row { return { ...row, stops: parseJson(row.stops_json, []), stops_json: undefined }; }
async function planDrafts(request: Request, env: Env, tripId: string, tail: string[]): Promise<Response> {
  const trip = await tripOr404(env, tripId); const draftId = tail[0];
  if (!draftId) {
    if (request.method === 'GET') { const date = stringParam(new URL(request.url).searchParams.get('date'), 'date'); const draft = await one(env, 'SELECT * FROM route_plan_drafts WHERE trip_id = ? AND date = ? ORDER BY updated_at DESC LIMIT 1', tripId, date); return ok(draft ? draftResponse(draft) : null); }
    if (request.method === 'PUT') { const data = await body(request, draftInput); dateInTrip(data.date, trip); const existing = await one(env, 'SELECT * FROM route_plan_drafts WHERE trip_id = ? AND date = ? ORDER BY updated_at DESC LIMIT 1', tripId, data.date); const stamp = now(); if (existing) { await run(env, 'UPDATE route_plan_drafts SET source = ?, stops_json = ?, status = ?, updated_at = ? WHERE id = ?', data.source, JSON.stringify(data.stops), 'draft', stamp, existing.id); return ok(draftResponse({ ...existing, source: data.source, stops_json: JSON.stringify(data.stops), status: 'draft', updated_at: stamp })); } const created = { id: id(), trip_id: tripId, date: data.date, source: data.source, stops_json: JSON.stringify(data.stops), status: 'draft', created_at: stamp, updated_at: stamp }; await run(env, 'INSERT INTO route_plan_drafts (id, trip_id, date, source, stops_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', created.id, created.trip_id, created.date, created.source, created.stops_json, created.status, stamp, stamp); return ok(draftResponse(created)); }
  }
  const draft = await one(env, 'SELECT * FROM route_plan_drafts WHERE id = ? AND trip_id = ?', draftId, tripId); if (!draft) throw new AppError('NOT_FOUND', '路线草稿不存在', 404);
  if (tail[1] === 'generate-routes' && request.method === 'POST') return ok(await generatedDraftRoutes(env, trip, draft, new URL(request.url).searchParams));
  if (tail[1] === 'confirm' && request.method === 'POST') return ok(await confirmDraft(env, trip, draft, new URL(request.url).searchParams));
  throw new AppError('NOT_FOUND', '接口不存在', 404);
}

async function generatedDraftRoutes(env: Env, trip: Row, draft: Row, params: URLSearchParams): Promise<Row> { const kind = params.get('route_type') === 'walking' ? 'walking' : 'transit'; const strategy = Number(params.get('strategy') ?? (kind === 'transit' ? 7 : 0)); const stops = parseJson<Array<{ place_id: string; order: number; start_time?: string | null; end_time?: string | null }>>(draft.stops_json, []); const segments: Row[] = []; for (let index = 0; index < stops.length - 1; index += 1) { const from = stops[index]; const to = stops[index + 1]; const fromPlace = await placeOr404(env, from.place_id); const toPlace = await placeOr404(env, to.place_id); const route = await amapRoute(env, kind, [toNumber(fromPlace.lng), toNumber(fromPlace.lat)], [toNumber(toPlace.lng), toNumber(toPlace.lat)], strategy, String(trip.city_name)); const token = await signedPreview(env, String(trip.id), from.place_id, to.place_id, route); const available = from.end_time && to.start_time ? Math.max(0, (Date.parse(`1970-01-01T${to.start_time}:00Z`) - Date.parse(`1970-01-01T${from.end_time}:00Z`)) / 1000) : null; segments.push({ from_place_id: from.place_id, to_place_id: to.place_id, from_order: from.order, to_order: to.order, route, preview_token: token, cache_hit: false, time_conflict: available !== null && route.duration_seconds > available, available_duration_seconds: available }); } return { draft_id: draft.id, segments }; }

async function confirmDraft(env: Env, trip: Row, draft: Row, params: URLSearchParams): Promise<Row> { const kind = params.get('route_type') === 'walking' ? 'walking' : 'transit'; const strategy = Number(params.get('strategy') ?? (kind === 'transit' ? 7 : 0)); const stops = parseJson<Array<{ place_id: string; title: string; order: number; start_time?: string | null; end_time?: string | null }>>(draft.stops_json, []); const day = String(draft.date); await run(env, 'DELETE FROM route_segments WHERE trip_id = ? AND transport_item_id IN (SELECT id FROM itinerary_items WHERE trip_id = ? AND date = ?)', trip.id, trip.id, day); await run(env, "DELETE FROM itinerary_items WHERE trip_id = ? AND date = ? AND kind IN ('activity', 'transport')", trip.id, day); const itemIds: string[] = []; const segmentIds: string[] = []; for (const stop of stops) { const itemId = id(); const stamp = now(); await run(env, 'INSERT INTO itinerary_items (id, trip_id, place_id, date, start_time, end_time, is_all_day, kind, category, title, description, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, NULL, ?, ?, ?)', itemId, trip.id, stop.place_id, day, stop.start_time ?? null, stop.end_time ?? null, 'activity', 'place', stop.title, stop.order * 10, stamp, stamp); itemIds.push(itemId); }
  for (let index = 0; index < itemIds.length - 1; index += 1) { const resolved = await resolveRoute(env, itemIds[index], itemIds[index + 1], kind, strategy); const segmentId = id(); const transportId = id(); const stamp = now(); const title = kind === 'walking' ? '步行前往下一站' : '前往下一站'; await run(env, 'INSERT INTO itinerary_items (id, trip_id, place_id, date, start_time, end_time, is_all_day, kind, category, title, description, sort_order, created_at, updated_at) VALUES (?, ?, NULL, ?, NULL, NULL, 0, ?, NULL, ?, ?, ?, ?, ?)', transportId, trip.id, day, 'transport', title, resolved.route.steps.map((step) => String(step.instruction ?? '')).filter(Boolean).join('\n') || null, (index + 1) * 10 - 1, stamp, stamp); await run(env, 'INSERT INTO route_segments (id, trip_id, transport_item_id, after_item_id, before_item_id, origin_place_id, destination_place_id, origin_name, origin_lng, origin_lat, destination_name, destination_lng, destination_lat, route_type, strategy, duration_seconds, distance_meters, walking_distance_meters, transfer_count, polyline_json, steps_json, provider, provider_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', segmentId, trip.id, transportId, itemIds[index], itemIds[index + 1], resolved.after.place_id, resolved.before.place_id, resolved.after.place_name, resolved.after.place_lng, resolved.after.place_lat, resolved.before.place_name, resolved.before.place_lng, resolved.before.place_lat, kind, strategy, resolved.route.duration_seconds, resolved.route.distance_meters, resolved.route.walking_distance_meters, resolved.route.transfer_count, JSON.stringify(resolved.route.polyline), JSON.stringify(resolved.route.steps), resolved.route.provider, resolved.route.provider_version, stamp, stamp); segmentIds.push(segmentId); }
  await run(env, 'UPDATE route_plan_drafts SET status = ?, updated_at = ? WHERE id = ?', 'confirmed', now(), draft.id); return { draft: draftResponse({ ...draft, status: 'confirmed', updated_at: now() }), item_ids: itemIds, segment_ids: segmentIds }; }

async function aiPlan(request: Request, env: Env, tripId: string): Promise<Response> { const trip = await tripOr404(env, tripId); const data = await body(request, z.object({ date: z.string().date(), place_ids: z.array(z.string().uuid()).min(1), day_start: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'), day_end: z.string().regex(/^\d{2}:\d{2}$/).default('21:00'), preferences: z.array(z.string()).default([]) })); dateInTrip(data.date, trip); if (data.day_end <= data.day_start) throw new AppError('VALIDATION_ERROR', 'day_end 必须晚于 day_start', 422); const places = await Promise.all(data.place_ids.map((placeId) => placeOr404(env, placeId))); if (places.some((place) => place.trip_id !== tripId)) throw new AppError('VALIDATION_ERROR', '地点无效', 422); let minutes = Number(data.day_start.slice(0, 2)) * 60 + Number(data.day_start.slice(3)); const stops = places.map((place, index) => { const start = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; minutes += 90; const end = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; minutes += 20; return { place_id: place.id, title: `游览${place.name}`, start_time: start, end_time: end, order: index + 1, preferred_duration_minutes: 90 }; }); const stamp = now(); const existing = await one(env, 'SELECT * FROM route_plan_drafts WHERE trip_id = ? AND date = ? ORDER BY updated_at DESC LIMIT 1', tripId, data.date); const draftId = existing?.id ? String(existing.id) : id(); if (existing) await run(env, 'UPDATE route_plan_drafts SET source = ?, stops_json = ?, status = ?, updated_at = ? WHERE id = ?', 'ai', JSON.stringify(stops), 'draft', stamp, draftId); else await run(env, 'INSERT INTO route_plan_drafts (id, trip_id, date, source, stops_json, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', draftId, tripId, data.date, 'ai', JSON.stringify(stops), 'draft', stamp, stamp); return ok({ id: draftId, trip_id: tripId, date: data.date, source: 'ai', stops, status: 'draft', created_at: existing?.created_at ?? stamp, updated_at: stamp }, 201); }

async function routeSegments(env: Env, tripId: string, date: string | null): Promise<Response> { await tripOr404(env, tripId); const data = await all(env, `SELECT s.* FROM route_segments s JOIN itinerary_items i ON i.id = s.transport_item_id WHERE s.trip_id = ? ${date ? 'AND i.date = ?' : ''} ORDER BY s.created_at ASC`, ...(date ? [tripId, date] : [tripId])); return ok(data.map((row) => ({ ...row, origin_lng: toNumber(row.origin_lng), origin_lat: toNumber(row.origin_lat), destination_lng: toNumber(row.destination_lng), destination_lat: toNumber(row.destination_lat), polyline_json: parseJson(row.polyline_json, []), steps_json: parseJson(row.steps_json, []) }))); }

async function routePreview(request: Request, env: Env, kind: 'transit' | 'walking'): Promise<Response> { const data = await body(request, z.object({ after_item_id: z.string().uuid(), before_item_id: z.string().uuid(), strategy: z.number().int().nullable().optional() })); const strategy = data.strategy ?? (kind === 'transit' ? 7 : 0); const resolved = await resolveRoute(env, data.after_item_id, data.before_item_id, kind, strategy); return ok({ route: resolved.route, cache_hit: resolved.cacheHit, preview_token: await signedPreview(env, String(resolved.trip.id), data.after_item_id, data.before_item_id, resolved.route) }); }
async function createSegment(request: Request, env: Env): Promise<Response> { const data = await body(request, z.object({ after_item_id: z.string().uuid(), before_item_id: z.string().uuid(), route_type: z.enum(['transit', 'walking']), strategy: z.number().int().nullable().optional(), preview_token: z.string().min(1) })); const strategy = data.strategy ?? (data.route_type === 'transit' ? 7 : 0); const resolved = await resolveRoute(env, data.after_item_id, data.before_item_id, data.route_type, strategy); await verifyPreview(env, data.preview_token, String(resolved.trip.id), data.after_item_id, data.before_item_id, resolved.route); const transportId = id(); const segmentId = id(); const stamp = now(); await run(env, 'INSERT INTO itinerary_items (id, trip_id, place_id, date, start_time, end_time, is_all_day, kind, category, title, description, sort_order, created_at, updated_at) VALUES (?, ?, NULL, ?, NULL, NULL, 0, ?, NULL, ?, ?, ?, ?, ?)', transportId, resolved.trip.id, resolved.after.date, 'transport', data.route_type === 'walking' ? '步行前往下一站' : '前往下一站', resolved.route.steps.map((step) => String(step.instruction ?? '')).filter(Boolean).join('\n') || null, toNumber(resolved.after.sort_order) + 1, stamp, stamp); await run(env, 'INSERT INTO route_segments (id, trip_id, transport_item_id, after_item_id, before_item_id, origin_place_id, destination_place_id, origin_name, origin_lng, origin_lat, destination_name, destination_lng, destination_lat, route_type, strategy, duration_seconds, distance_meters, walking_distance_meters, transfer_count, polyline_json, steps_json, provider, provider_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', segmentId, resolved.trip.id, transportId, data.after_item_id, data.before_item_id, resolved.after.place_id, resolved.before.place_id, resolved.after.place_name, resolved.after.place_lng, resolved.after.place_lat, resolved.before.place_name, resolved.before.place_lng, resolved.before.place_lat, data.route_type, strategy, resolved.route.duration_seconds, resolved.route.distance_meters, resolved.route.walking_distance_meters, resolved.route.transfer_count, JSON.stringify(resolved.route.polyline), JSON.stringify(resolved.route.steps), resolved.route.provider, resolved.route.provider_version, stamp, stamp); return ok((await one(env, 'SELECT * FROM route_segments WHERE id = ?', segmentId))!, 201); }

export const onRequest = async (context: Context): Promise<Response> => {
  try {
    const path = context.params.path ?? [];
    const { request, env } = context;
    if (path[0] === 'trips') return trips(request, env, path);
    if (path[0] === 'items' && path[1]) return item(request, env, path[1]);
    if (path[0] === 'places' && path[1] === 'search' && request.method === 'GET') { const url = new URL(request.url); return ok(await searchPlaces(env, stringParam(url.searchParams.get('keyword'), 'keyword'), stringParam(url.searchParams.get('city'), 'city'))); }
    if (path[0] === 'places' && path[1]) return place(request, env, path[1]);
    if (path[0] === 'geo' && path[1] === 'city-center' && request.method === 'GET') return ok(await cityCenter(env, stringParam(new URL(request.url).searchParams.get('city'), 'city')));
    if (path[0] === 'city-hints' && request.method === 'GET') { const city = stringParam(new URL(request.url).searchParams.get('city'), 'city'); const fallback = { 广州: ['中山大学', '陈家祠', '白云山', '沙面'], 西安: ['西安城墙', '兵马俑', '陕西历史博物馆'], 成都: ['宽窄巷子', '成都大熊猫繁育研究基地', '锦里'], 北京: ['故宫博物院', '天安门广场', '颐和园'], 上海: ['外滩', '东方明珠', '豫园'] } as Record<string, string[]>; const names = fallback[city] ?? [`${city}博物馆`, `${city}公园`]; const places = (await Promise.all(names.map(async (name) => (await searchPlaces(env, name, city))[0] ?? null))).filter(Boolean); return ok({ city_name: city, titles: names.map((name) => `游览${name}`), places, source: 'fallback' }); }
    if (path[0] === 'routes' && path[1] === 'transit' && path[2] === 'preview' && request.method === 'POST') return routePreview(request, env, 'transit');
    if (path[0] === 'routes' && path[1] === 'walking' && path[2] === 'preview' && request.method === 'POST') return routePreview(request, env, 'walking');
    if (path[0] === 'routes' && path[1] === 'segments' && request.method === 'POST') return createSegment(request, env);
    if (path[0] === 'routes' && path[1] === 'segments' && path[2] && request.method === 'DELETE') { const segment = await one(env, 'SELECT * FROM route_segments WHERE id = ?', path[2]); if (!segment) throw new AppError('NOT_FOUND', '路线段不存在', 404); await run(env, 'DELETE FROM route_segments WHERE id = ?', path[2]); await run(env, 'DELETE FROM itinerary_items WHERE id = ?', segment.transport_item_id); return ok({ ok: true }); }
    throw new AppError('NOT_FOUND', '接口不存在', 404);
  } catch (error) {
    return apiError(error);
  }
};
