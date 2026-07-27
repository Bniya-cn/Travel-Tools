import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AmapMap } from '../features/map/components/AmapMap';
import type { MapFocus } from '../features/map/components/AmapMap';
import { RouteStepsList } from '../features/routes/components/RouteStepsList';
import { useCityCenter, useCityHints } from '../hooks/useCity';
import { useCreatePlace, usePlaceSearch } from '../hooks/usePlaces';
import { useItems } from '../hooks/useItems';
import { useTrip } from '../hooks/useTrips';
import {
  useAiPlan,
  useConfirmDraft,
  useGenerateRoutes,
  usePlanDraft,
  useSavePlanDraft,
  useTripPlaces,
  useUpdateTripPlace,
} from '../hooks/useWorkspace';
import { eachDate } from '../utils/dates';
import { toLngLat } from '../types/place';
import type { DraftStop, DraftRouteSegmentPreview } from '../types/workspace';
import type { LngLatTuple } from '../types/route';
import { ApiClientError } from '../types/api';

const FALLBACK_CENTER = { lng: 113.2644, lat: 23.1291 };
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

function orderLabel(n: number): string {
  return CIRCLED[n - 1] ?? String(n);
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const total = Math.min(h * 60 + m + Math.max(1, minutes), 23 * 60 + 59);
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

function isValidHhMm(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

export function TripPlannerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: trip, isLoading: tripLoading, error: tripError } = useTrip(tripId);

  const dates = useMemo(
    () => (trip ? eachDate(trip.start_date, trip.end_date) : []),
    [trip],
  );
  const selectedDate = searchParams.get('date') || trip?.start_date || dates[0] || '';

  const { data: cityCenter } = useCityCenter(trip?.city_name);
  const { data: cityHints, isLoading: hintsLoading } = useCityHints(trip?.city_name);
  const { data: tripPlaces } = useTripPlaces(tripId);
  const { data: draft } = usePlanDraft(tripId, selectedDate || undefined);
  const { data: savedItems } = useItems(tripId, selectedDate || undefined);

  const createPlace = useCreatePlace(tripId || '');
  const updateTripPlace = useUpdateTripPlace(tripId || '');
  const saveDraft = useSavePlanDraft(tripId || '');
  const generateRoutes = useGenerateRoutes(tripId || '');
  const confirmDraft = useConfirmDraft(tripId || '', selectedDate);
  const aiPlan = useAiPlan(tripId || '');

  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [stops, setStops] = useState<DraftStop[]>([]);
  const stopsRef = useRef(stops);
  const [routeType, setRouteType] = useState<'transit' | 'walking'>('transit');
  const [routePreview, setRoutePreview] = useState<DraftRouteSegmentPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [mapFocus, setMapFocus] = useState<MapFocus>(null);
  const drawerDragRef = useRef<{ startY: number } | null>(null);

  function onDrawerHandlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawerDragRef.current = { startY: e.clientY };
  }

  function onDrawerHandlePointerUp(e: PointerEvent<HTMLDivElement>) {
    const start = drawerDragRef.current;
    drawerDragRef.current = null;
    if (!start) return;
    const dy = e.clientY - start.startY;
    if (dy > 48) {
      setDrawerOpen(false);
      return;
    }
    if (dy < -48) {
      setDrawerOpen(true);
      return;
    }
    // 轻点把手：切换开合
    if (Math.abs(dy) < 10) {
      setDrawerOpen((v) => !v);
    }
  }

  useEffect(() => {
    stopsRef.current = stops;
  }, [stops]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(keyword.trim()), 400);
    return () => window.clearTimeout(t);
  }, [keyword]);

  const search = usePlaceSearch(debounced, trip?.city_name, debounced.length > 0);

  // 仅在切换日期 / 换草稿时同步；不要监听 updated_at，否则「生成路线」后的 saveDraft
  // 会 refetch 并把刚画上的 routePreview 清掉（闪一下就消失）。
  useEffect(() => {
    setRoutePreview([]);
    if (draft?.stops) {
      setStops(draft.stops);
    } else {
      setStops([]);
    }
  }, [selectedDate, draft?.id]);

  const pool = useMemo(
    () => (tripPlaces ?? []).filter((tp) => tp.status !== 'removed' && tp.place),
    [tripPlaces],
  );

  const mapPlaces = useMemo(() => pool.map((tp) => tp.place!).filter(Boolean), [pool]);

  const markerLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    if (stops.length > 0) {
      for (const s of stops) labels[s.place_id] = orderLabel(s.order);
    } else {
      pool.forEach((tp, i) => {
        labels[tp.place_id] = orderLabel(i + 1);
      });
    }
    return labels;
  }, [stops, pool]);

  const mapCenter = useMemo(() => {
    if (stops.length > 0) {
      const first = mapPlaces.find((p) => p.id === stops[0].place_id);
      if (first) return toLngLat(first);
    }
    if (mapPlaces.length > 0) return toLngLat(mapPlaces[0]);
    if (cityCenter) return { lng: cityCenter.lng, lat: cityCenter.lat };
    return FALLBACK_CENTER;
  }, [stops, mapPlaces, cityCenter]);

  const polyline = useMemo<LngLatTuple[]>(() => {
    const path: LngLatTuple[] = [];
    for (const seg of routePreview) {
      for (const pt of seg.route.polyline ?? []) {
        path.push(pt as LngLatTuple);
      }
    }
    return path;
  }, [routePreview]);

  const polylines = useMemo(
    () =>
      routePreview
        .map((seg) => (seg.route.polyline ?? []) as LngLatTuple[])
        .filter((p) => p.length >= 2),
    [routePreview],
  );

  function selectDate(date: string) {
    setSearchParams({ date });
    setRoutePreview([]);
    setMapFocus(null);
  }

  async function handleAddSearchHit(hit: {
    name: string;
    address: string | null;
    city_name: string | null;
    district: string | null;
    lng: number;
    lat: number;
    amap_poi_id: string | null;
  }) {
    if (!tripId || !trip) return;
    setError(null);
    try {
      await createPlace.mutateAsync({
        name: hit.name,
        amap_poi_id: hit.amap_poi_id,
        address: hit.address,
        city_name: hit.city_name ?? trip.city_name,
        district: hit.district,
        lng: hit.lng,
        lat: hit.lat,
      });
      setKeyword('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '加入地点失败');
    }
  }

  async function handleAddRecommended(name: string, hit?: {
    name: string;
    address: string | null;
    city_name: string | null;
    district: string | null;
    lng: number;
    lat: number;
    amap_poi_id: string | null;
  }) {
    if (hit) {
      await handleAddSearchHit(hit);
      return;
    }
    setKeyword(name);
  }

  function isInToday(placeId: string) {
    return stops.some((s) => s.place_id === placeId);
  }

  async function persistStops(next: DraftStop[]) {
    if (!tripId || !selectedDate) return;
    setError(null);
    const normalized = next.map((s, i) => ({
      ...s,
      order: i + 1,
      start_time: isValidHhMm(s.start_time) ? s.start_time : null,
      end_time: isValidHhMm(s.end_time) ? s.end_time : null,
    }));
    setStops(normalized);
    setRoutePreview([]);
    try {
      await saveDraft.mutateAsync({ date: selectedDate, stops: normalized, source: 'manual' });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '保存草稿失败');
    }
  }

  async function addToToday(placeId: string, title: string) {
    if (isInToday(placeId)) return;
    const defaultStart = stops.length === 0 ? '09:00' : null;
    const duration = 90;
    await persistStops([
      ...stops,
      {
        place_id: placeId,
        title,
        start_time: defaultStart,
        end_time: defaultStart ? addMinutes(defaultStart, duration) : null,
        order: stops.length + 1,
        preferred_duration_minutes: duration,
      },
    ]);
  }

  async function removeFromToday(placeId: string) {
    await persistStops(stops.filter((s) => s.place_id !== placeId));
  }

  async function moveStop(placeId: string, dir: -1 | 1) {
    const idx = stops.findIndex((s) => s.place_id === placeId);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= stops.length) return;
    const next = stops.slice();
    [next[idx], next[j]] = [next[j], next[idx]];
    await persistStops(next);
  }

  function updateStopTimeLocal(placeId: string, start: string, durationMin: number) {
    const duration = Math.min(Math.max(durationMin || 90, 15), 480);
    const startTime = isValidHhMm(start) ? start : null;
    const endTime = startTime ? addMinutes(startTime, duration) : null;
    setStops((prev) =>
      prev.map((s) =>
        s.place_id === placeId
          ? {
              ...s,
              start_time: startTime,
              end_time: endTime,
              preferred_duration_minutes: duration,
            }
          : s,
      ),
    );
    setRoutePreview([]);
  }

  async function commitStopTime() {
    const current = stopsRef.current;
    // 仅提交合法时间或空时间，避免输入中的非法字符串打到后端
    const safe = current.map((s) => ({
      ...s,
      start_time: isValidHhMm(s.start_time) ? s.start_time : null,
      end_time: isValidHhMm(s.end_time) ? s.end_time : null,
    }));
    await persistStops(safe);
  }

  async function handleAiPlan() {
    if (!tripId || !selectedDate) return;
    const ids = pool.map((p) => p.place_id);
    if (ids.length < 2) {
      setError('请先在地点池加入至少 2 个地点');
      return;
    }
    setError(null);
    try {
      const result = await aiPlan.mutateAsync({
        date: selectedDate,
        place_ids: ids.slice(0, 8),
        day_start: '09:00',
        day_end: '21:00',
      });
      setStops(result.stops);
      setRoutePreview([]);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'AI 规划失败');
    }
  }

  async function handleGenerateRoutes() {
    if (!tripId || !selectedDate) return;
    setError(null);
    try {
      const saved = await saveDraft.mutateAsync({ date: selectedDate, stops, source: 'manual' });
      const result = await generateRoutes.mutateAsync({
        draftId: saved.id,
        routeType,
      });
      setRoutePreview(result.segments);
      const conflicts = result.segments.filter((s) => s.time_conflict);
      if (conflicts.length) {
        setError(`有 ${conflicts.length} 段交通时长可能超过空档，请调整停留时间后再保存`);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '生成路线失败');
    }
  }

  async function handleConfirm() {
    if (!tripId || !selectedDate) return;
    setError(null);
    try {
      const saved = await saveDraft.mutateAsync({ date: selectedDate, stops, source: 'manual' });
      await confirmDraft.mutateAsync({ draftId: saved.id, routeType });
      setRoutePreview([]);
      setDrawerOpen(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : '保存行程失败');
    }
  }

  const softRemove = useCallback(
    async (tripPlaceId: string) => {
      try {
        await updateTripPlace.mutateAsync({ tripPlaceId, status: 'removed' });
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : '移除失败');
      }
    },
    [updateTripPlace],
  );

  if (tripLoading) {
    return <div className="md-empty page-pad">加载旅行…</div>;
  }
  if (tripError || !trip || !tripId) {
    return (
      <div className="page-pad">
        <div className="md-banner md-banner--error">旅行不存在或加载失败</div>
        <Link to="/">返回列表</Link>
      </div>
    );
  }

  const canGenerate = stops.length >= 2 && stops.every((s) => s.start_time && s.end_time);

  return (
    <div className="map-workspace">
      <header className="map-workspace__top">
        <div className="map-workspace__top-left">
          <Link to="/" className="md-link">
            ← 返回
          </Link>
          <div>
            <h1>{trip.name}</h1>
            <p className="md-muted">
              {trip.city_name} · {selectedDate}
            </p>
          </div>
        </div>
        <div className="map-workspace__dates">
          {dates.map((d) => (
            <button
              key={d}
              type="button"
              className={d === selectedDate ? 'date-chip is-active' : 'date-chip'}
              onClick={() => selectDate(d)}
            >
              {d.slice(5)}
            </button>
          ))}
        </div>
        <div className="map-workspace__actions">
          <button
            type="button"
            className="md-btn md-btn--primary"
            onClick={handleAiPlan}
            disabled={aiPlan.isPending || pool.length < 2}
          >
            {aiPlan.isPending ? 'AI 规划中…' : 'AI 规划'}
          </button>
          <button
            type="button"
            className="md-btn md-btn--text map-workspace__drawer-toggle"
            onClick={() => setDrawerOpen((v) => !v)}
          >
            {drawerOpen ? '收起面板 ↓' : '展开面板 ↑'}
          </button>
        </div>
      </header>

      <div className="map-workspace__search">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder={`搜索${trip.city_name}地点并加入旅行`}
        />
        {search.isFetching && <span className="md-muted">搜索中…</span>}
        {debounced && search.data && search.data.length > 0 && (
          <ul className="map-workspace__search-list">
            {search.data.map((hit) => (
              <li key={`${hit.amap_poi_id ?? hit.name}-${hit.lng}`}>
                <button type="button" onClick={() => handleAddSearchHit(hit)}>
                  <strong>{hit.name}</strong>
                  <span className="md-muted">{hit.address || hit.district || ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <div className="map-workspace__banner md-banner md-banner--error">{error}</div>}

      <div className="map-workspace__stage">
        <AmapMap
          className="amap-wrap--fullscreen"
          center={mapCenter}
          markers={mapPlaces}
          markerLabels={markerLabels}
          focus={mapFocus}
          polyline={polyline}
          polylines={polylines}
        />

        <aside
          className={
            drawerOpen
              ? 'map-workspace__drawer is-open'
              : 'map-workspace__drawer is-closed'
          }
          aria-hidden={!drawerOpen}
        >
          <div
            className="map-workspace__drawer-handle"
            onPointerDown={onDrawerHandlePointerDown}
            onPointerUp={onDrawerHandlePointerUp}
            onPointerCancel={() => {
              drawerDragRef.current = null;
            }}
            role="button"
            tabIndex={0}
            aria-label={drawerOpen ? '下滑收起面板' : '上滑展开面板'}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrawerOpen((v) => !v);
              }
            }}
          >
            <span className="map-workspace__drawer-grip" aria-hidden />
            <span className="map-workspace__drawer-handle-text">
              {drawerOpen ? '下滑或点击收起' : '上滑或点击展开 · 今日路线 / 已保存 / 地点池'}
            </span>
          </div>
          <div className="map-workspace__drawer-body">
          <section className="map-panel">
            <div className="map-panel__title-row">
              <h2>今日路线</h2>
              <button
                type="button"
                className="map-panel__collapse"
                onClick={() => setDrawerOpen(false)}
              >
                收起 ↓
              </button>
            </div>
            {stops.length === 0 && (
              <p className="md-muted map-empty">从右侧地点池加入地点，或点击「AI 规划」</p>
            )}
            <ol className="today-list">
              {stops.map((s, idx) => (
                <li key={s.place_id} className="today-list__item">
                  <div className="today-list__head">
                    <span className="today-list__badge">{orderLabel(idx + 1)}</span>
                    <strong>{s.title}</strong>
                  </div>
                  <div className="today-list__times">
                    <label>
                      开始
                      <input
                        type="time"
                        value={s.start_time ?? ''}
                        onChange={(e) =>
                          updateStopTimeLocal(
                            s.place_id,
                            e.target.value,
                            s.preferred_duration_minutes ?? 90,
                          )
                        }
                        onBlur={() => commitStopTime()}
                      />
                    </label>
                    <label>
                      停留(分)
                      <input
                        type="number"
                        min={15}
                        max={480}
                        value={s.preferred_duration_minutes ?? 90}
                        onChange={(e) =>
                          updateStopTimeLocal(
                            s.place_id,
                            s.start_time || '09:00',
                            Number(e.target.value) || 90,
                          )
                        }
                        onBlur={() => commitStopTime()}
                      />
                    </label>
                    <span className="md-muted">至 {s.end_time || '—'}</span>
                  </div>
                  <div className="today-list__ops">
                    <button type="button" onClick={() => moveStop(s.place_id, -1)}>
                      上移
                    </button>
                    <button type="button" onClick={() => moveStop(s.place_id, 1)}>
                      下移
                    </button>
                    <button type="button" onClick={() => removeFromToday(s.place_id)}>
                      移除
                    </button>
                  </div>
                  {idx < stops.length - 1 &&
                    routePreview.find(
                      (r) => r.from_place_id === s.place_id && r.to_place_id === stops[idx + 1].place_id,
                    ) && (
                      <div
                        className={
                          routePreview.find((r) => r.from_place_id === s.place_id)?.time_conflict
                            ? 'today-list__transit is-warn'
                            : 'today-list__transit'
                        }
                      >
                        {(() => {
                          const seg = routePreview.find((r) => r.from_place_id === s.place_id)!;
                          return (
                            <>
                              <div className="today-list__transit-summary">
                                {routeType === 'transit' ? '地铁/公交' : '步行'} ·{' '}
                                {formatDuration(seg.route.duration_seconds)} ·{' '}
                                {(seg.route.distance_meters / 1000).toFixed(1)} km
                                {seg.route.transfer_count > 0
                                  ? ` · 换乘 ${seg.route.transfer_count}`
                                  : ''}
                              </div>
                              <RouteStepsList steps={seg.route.steps} compact />
                            </>
                          );
                        })()}
                      </div>
                    )}
                </li>
              ))}
            </ol>

            <div className="map-panel__route-tools">
              <div className="route-preview__tabs">
                <button
                  type="button"
                  className={routeType === 'transit' ? 'is-active' : ''}
                  onClick={() => setRouteType('transit')}
                >
                  公交/地铁
                </button>
                <button
                  type="button"
                  className={routeType === 'walking' ? 'is-active' : ''}
                  onClick={() => setRouteType('walking')}
                >
                  步行
                </button>
              </div>
              <button
                type="button"
                className="md-btn md-btn--primary"
                disabled={!canGenerate || generateRoutes.isPending}
                onClick={handleGenerateRoutes}
              >
                {generateRoutes.isPending ? '计算中…' : '生成路线'}
              </button>
              <button
                type="button"
                className="md-btn md-btn--primary"
                disabled={!routePreview.length || confirmDraft.isPending}
                onClick={handleConfirm}
              >
                {confirmDraft.isPending ? '保存中…' : '保存行程'}
              </button>
              {routePreview.length > 0 && (
                <p className="md-muted map-panel__hint">
                  路线已预览（地图折线）。确认无误后点「保存行程」，再到「已保存行程」查看完整计划。
                </p>
              )}
            </div>
          </section>

          <section className="map-panel map-panel--saved">
            <h2>已保存行程</h2>
            <p className="md-muted map-panel__hint">
              {savedItems && savedItems.length > 0
                ? `当日已有 ${savedItems.length} 条事项（含交通）`
                : '保存后可在二级页查看完整地图与地铁计划'}
            </p>
            <Link
              className="md-btn md-btn--primary map-panel__saved-link"
              to={
                selectedDate
                  ? `/trips/${tripId}/saved?date=${encodeURIComponent(selectedDate)}`
                  : `/trips/${tripId}/saved`
              }
            >
              查看完整行程 →
            </Link>
          </section>

          <section className="map-panel">
            <h2>地点池</h2>
            {hintsLoading && <p className="md-muted">加载推荐…</p>}
            {!hintsLoading && cityHints?.places && cityHints.places.length > 0 && (
              <div className="recommend-block">
                <span className="recommend-block__label">城市推荐（点击加入）</span>
                <ul className="place-search__list">
                  {cityHints.places.map((hit) => (
                    <li key={`rec-${hit.amap_poi_id ?? hit.name}`}>
                      <button
                        type="button"
                        className="place-search__item"
                        onClick={() => handleAddRecommended(hit.name, hit)}
                        disabled={createPlace.isPending}
                      >
                        <strong>{hit.name}</strong>
                        <span className="md-muted">{hit.address || hit.district || ''}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {pool.length === 0 && (
              <p className="md-muted map-empty">搜索地点或点推荐，加入旅行地点池</p>
            )}
            <ul className="pool-list">
              {pool.map((tp, i) => (
                <li key={tp.id} className="pool-list__item">
                  <div>
                    <span className="today-list__badge">{orderLabel(i + 1)}</span>
                    <strong>{tp.place?.name}</strong>
                    <span className="md-muted pool-list__status">{tp.status}</span>
                  </div>
                  <div className="pool-list__ops">
                    <button
                      type="button"
                      disabled={isInToday(tp.place_id)}
                      onClick={() => addToToday(tp.place_id, tp.place?.name || '游览')}
                    >
                      {isInToday(tp.place_id) ? '已在今日' : '加入今日'}
                    </button>
                    <button type="button" onClick={() => softRemove(tp.id)}>
                      移除
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
