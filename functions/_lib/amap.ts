import { AppError, type Env } from './runtime';

export type PlaceSearchResult = {
  name: string;
  address: string | null;
  city_name: string | null;
  district: string | null;
  lng: number;
  lat: number;
  amap_poi_id: string | null;
};

export type Route = {
  route_type: 'transit' | 'walking';
  strategy: number;
  duration_seconds: number;
  distance_meters: number;
  walking_distance_meters: number | null;
  transfer_count: number;
  polyline: number[][];
  steps: Record<string, unknown>[];
  provider: string;
  provider_version: string;
};

function key(env: Env): string {
  if (!env.AMAP_WEB_SERVICE_KEY?.trim()) {
    throw new AppError('AMAP_SERVICE_ERROR', '未配置高德 Web 服务 Key', 502);
  }
  return env.AMAP_WEB_SERVICE_KEY;
}

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function polyline(value: unknown): number[][] {
  if (typeof value !== 'string') return [];
  return value.split(';').flatMap((point) => {
    const [lng, lat] = point.split(',').map(Number);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [[lng, lat]] : [];
  });
}

async function amap(url: string, params: Record<string, string | number>): Promise<Record<string, unknown>> {
  const endpoint = new URL(url);
  Object.entries(params).forEach(([name, value]) => endpoint.searchParams.set(name, String(value)));
  let response: Response;
  try {
    response = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new AppError('AMAP_SERVICE_ERROR', '高德服务网络异常', 502);
  }
  if (!response.ok) throw new AppError('AMAP_SERVICE_ERROR', '高德服务请求失败', 502);
  const data = await response.json() as Record<string, unknown>;
  if (String(data.status) !== '1') {
    throw new AppError('AMAP_SERVICE_ERROR', '高德服务查询失败', 502, { amap_info: data.info ?? data.infocode ?? 'unknown' });
  }
  return data;
}

export async function searchPlaces(env: Env, keyword: string, city: string): Promise<PlaceSearchResult[]> {
  const data = await amap('https://restapi.amap.com/v5/place/text', {
    key: key(env), keywords: keyword, city, citylimit: 'true', offset: 20, page: 1, extensions: 'base',
  });
  const pois = Array.isArray(data.pois) ? data.pois : [];
  return pois.flatMap((entry): PlaceSearchResult[] => {
    if (!entry || typeof entry !== 'object') return [];
    const poi = entry as Record<string, unknown>;
    const [lng, lat] = typeof poi.location === 'string' ? poi.location.split(',').map(Number) : [];
    if (!String(poi.name ?? '').trim() || !Number.isFinite(lng) || !Number.isFinite(lat)) return [];
    return [{
      name: String(poi.name).trim(),
      address: poi.address ? String(poi.address) : null,
      city_name: poi.cityname ? String(poi.cityname) : null,
      district: poi.adname ? String(poi.adname) : null,
      lng, lat, amap_poi_id: poi.id ? String(poi.id) : null,
    }];
  });
}

export async function cityCenter(env: Env, city: string): Promise<{ city_name: string; lng: number; lat: number }> {
  const data = await amap('https://restapi.amap.com/v3/geocode/geo', { key: key(env), address: city, city });
  const first = Array.isArray(data.geocodes) ? data.geocodes[0] : null;
  if (!first || typeof first !== 'object') throw new AppError('AMAP_SERVICE_ERROR', '无法解析该城市坐标', 502);
  const [lng, lat] = typeof (first as Record<string, unknown>).location === 'string'
    ? String((first as Record<string, unknown>).location).split(',').map(Number) : [];
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new AppError('AMAP_SERVICE_ERROR', '无法解析该城市坐标', 502);
  return { city_name: city, lng, lat };
}

export async function route(env: Env, kind: 'transit' | 'walking', start: [number, number], end: [number, number], strategy = 0, city?: string): Promise<Route> {
  const origin = `${start[0]},${start[1]}`;
  const destination = `${end[0]},${end[1]}`;
  if (kind === 'walking') {
    const data = await amap('https://restapi.amap.com/v3/direction/walking', { key: key(env), origin, destination });
    const paths = ((data.route as Record<string, unknown> | undefined)?.paths ?? []) as unknown[];
    const first = paths[0] as Record<string, unknown> | undefined;
    if (!first) throw new AppError('AMAP_SERVICE_ERROR', '高德未返回步行路线', 502);
    const steps = Array.isArray(first.steps) ? first.steps as Record<string, unknown>[] : [];
    const points = steps.flatMap((step) => polyline(step.polyline));
    return { route_type: 'walking', strategy: 0, duration_seconds: number(first.duration), distance_meters: number(first.distance), walking_distance_meters: number(first.distance), transfer_count: 0, polyline: points.length ? points : polyline(first.polyline), steps: steps.map((step) => ({ instruction: step.instruction ?? null, distance_meters: number(step.distance), duration_seconds: number(step.duration), mode: 'walking' })), provider: 'amap', provider_version: 'v5.1' };
  }
  // 与原 FastAPI 服务保持一致：公交规划使用 v3 接口及 city/cityd 参数。
  const data = await amap('https://restapi.amap.com/v3/direction/transit/integrated', {
    key: key(env), origin, destination, city: city ?? '', cityd: city ?? '', strategy,
    AlternativeRoute: 1, nightflag: 0, extensions: 'all',
  });
  const transits = ((data.route as Record<string, unknown> | undefined)?.transits ?? []) as unknown[];
  const first = transits[0] as Record<string, unknown> | undefined;
  if (!first) throw new AppError('AMAP_SERVICE_ERROR', '高德未返回公交路线', 502);
  const segments = Array.isArray(first.segments) ? first.segments as Record<string, unknown>[] : [];
  const steps: Record<string, unknown>[] = [];
  const points: number[][] = [];
  let transitLegs = 0;
  for (const segment of segments) {
    const walking = segment.walking as Record<string, unknown> | undefined;
    const walkingSteps = Array.isArray(walking?.steps) ? walking.steps as Record<string, unknown>[] : [];
    let walkingDistance = 0;
    let walkingDuration = 0;
    for (const item of walkingSteps) { points.push(...polyline(item.polyline)); walkingDistance += number(item.distance); walkingDuration += number(item.duration); }
    if (walkingSteps.length) steps.push({ instruction: `步行约 ${walkingDistance} 米`, distance_meters: walkingDistance, duration_seconds: walkingDuration, mode: 'walking' });
    const lines = Array.isArray((segment.bus as Record<string, unknown> | undefined)?.buslines) ? (segment.bus as Record<string, unknown>).buslines as Record<string, unknown>[] : [];
    for (const line of lines) {
      transitLegs += 1;
      points.push(...polyline(line.polyline));
      const departure = line.departure_stop as Record<string, unknown> | undefined;
      const arrival = line.arrival_stop as Record<string, unknown> | undefined;
      const lineName = String(line.name ?? line.type ?? '公共交通');
      steps.push({ instruction: `${lineName}${departure?.name && arrival?.name ? ` · ${departure.name}上车 → ${arrival.name}下车` : ''}`, distance_meters: number(line.distance), duration_seconds: number(line.duration), mode: 'transit', line_name: lineName, line_type: line.type ?? null, departure_stop: departure?.name ?? null, arrival_stop: arrival?.name ?? null, via_num: number(line.via_num) });
    }
  }
  return { route_type: 'transit', strategy, duration_seconds: number(first.duration), distance_meters: number(first.distance), walking_distance_meters: number(first.walking_distance), transfer_count: Math.max(0, transitLegs - 1), polyline: points, steps, provider: 'amap', provider_version: 'v5.1' };
}
