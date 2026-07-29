import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ItineraryTimeline } from '../components/trip-planner/ItineraryTimeline';
import { PlannerMapPanel } from '../components/trip-planner/PlannerMapPanel';
import { PlaceLibrary } from '../components/trip-planner/PlaceLibrary';
import { PlannerSidebar } from '../components/trip-planner/PlannerSidebar';
import { PlannerToast } from '../components/trip-planner/PlannerToast';
import { formatPlannerError } from '../components/trip-planner/plannerUtils';
import { useCityCenter, useCityHints } from '../hooks/useCity';
import { useCreatePlace, usePlaceSearch } from '../hooks/usePlaces';
import { useItems } from '../hooks/useItems';
import { useTrip } from '../hooks/useTrips';
import { useAiPlan, useConfirmDraft, useGenerateRoutes, usePlanDraft, useSavePlanDraft, useTripPlaces, useUpdateTripPlace } from '../hooks/useWorkspace';
import type { MapFocus } from '../features/map/components/AmapMap';
import { eachDate } from '../utils/dates';
import { toLngLat } from '../types/place';
import type { PlaceSearchResult } from '../types/place';
import type { DraftRouteSegmentPreview, DraftStop } from '../types/workspace';
import type { LngLatTuple } from '../types/route';
import '../styles/trip-planner.css';

const FALLBACK_CENTER = { lng: 113.2644, lat: 23.1291 };
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';

function orderLabel(order: number): string {
  return CIRCLED[order - 1] ?? String(order);
}

function addMinutes(hhmm: string, minutes: number): string {
  const [hour, minute] = hhmm.split(':').map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return hhmm;
  const total = Math.min(hour * 60 + minute + Math.max(1, minutes), 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function isValidHhMm(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{2}:\d{2}$/.test(value));
}

type MobileTab = 'itinerary' | 'places' | 'map';

export function TripPlannerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: trip, isLoading: tripLoading, error: tripError } = useTrip(tripId);
  const dates = useMemo(() => (trip ? eachDate(trip.start_date, trip.end_date) : []), [trip]);
  const selectedDate = searchParams.get('date') || trip?.start_date || dates[0] || '';

  const { data: cityCenter } = useCityCenter(trip?.city_name);
  const { data: cityHints, isLoading: hintsLoading } = useCityHints(trip?.city_name);
  const { data: tripPlaces, isLoading: placesLoading } = useTripPlaces(tripId);
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
  const [toast, setToast] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('itinerary');
  const syncedDraftIdRef = useRef<string | null>(null);

  const search = usePlaceSearch(debounced, trip?.city_name, debounced.length > 0);
  const pool = useMemo(() => (tripPlaces ?? []).filter((item) => item.status !== 'removed' && item.place), [tripPlaces]);
  const mapPlaces = useMemo(() => pool.map((item) => item.place!).filter(Boolean), [pool]);

  const markerLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    if (stops.length) stops.forEach((stop) => { labels[stop.place_id] = orderLabel(stop.order); });
    else pool.forEach((item, index) => { labels[item.place_id] = orderLabel(index + 1); });
    return labels;
  }, [pool, stops]);

  const mapCenter = useMemo(() => {
    const firstStop = stops.length ? mapPlaces.find((place) => place.id === stops[0].place_id) : null;
    if (firstStop) return toLngLat(firstStop);
    if (mapPlaces[0]) return toLngLat(mapPlaces[0]);
    if (cityCenter) return { lng: cityCenter.lng, lat: cityCenter.lat };
    return FALLBACK_CENTER;
  }, [cityCenter, mapPlaces, stops]);

  const polylines = useMemo(() => routePreview.map((segment) => (segment.route.polyline ?? []) as LngLatTuple[]).filter((path) => path.length >= 2), [routePreview]);
  const canGenerate = stops.length >= 2 && stops.every((stop) => stop.start_time && stop.end_time);

  const showError = useCallback((action: string, error: unknown) => {
    if (import.meta.env.DEV) console.error(`[travel-planner] ${action}`, error);
    setToast(formatPlannerError(action, error));
  }, []);

  useEffect(() => { stopsRef.current = stops; }, [stops]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [keyword]);
  useEffect(() => {
    syncedDraftIdRef.current = `pending:${selectedDate}`;
    setRoutePreview([]);
    setStops([]);
  }, [selectedDate]);
  useEffect(() => {
    const nextDraftId = draft?.id ?? null;
    if (syncedDraftIdRef.current === nextDraftId) return;
    syncedDraftIdRef.current = nextDraftId;
    // 同一草稿保存后会重新请求，不能覆盖刚生成的路线预览。
    setRoutePreview([]);
    setStops(draft?.stops ?? []);
  }, [draft]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5200);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (selectedPlaceId && !mapPlaces.some((place) => place.id === selectedPlaceId)) setSelectedPlaceId(null);
  }, [mapPlaces, selectedPlaceId]);

  const selectPlace = useCallback((placeId: string) => {
    const place = mapPlaces.find((item) => item.id === placeId);
    if (!place) return;
    setSelectedPlaceId(placeId);
    setMapFocus(toLngLat(place));
  }, [mapPlaces]);

  function selectDate(date: string) {
    setSearchParams({ date });
    setMapFocus(null);
    setSelectedPlaceId(null);
    setRoutePreview([]);
  }

  async function handleAddSearchHit(hit: PlaceSearchResult) {
    if (!tripId || !trip) return;
    try {
      await createPlace.mutateAsync({ name: hit.name, amap_poi_id: hit.amap_poi_id, address: hit.address, city_name: hit.city_name ?? trip.city_name, district: hit.district, lng: hit.lng, lat: hit.lat });
      setKeyword('');
    } catch (error) { showError('加入地点', error); }
  }

  async function persistStops(next: DraftStop[]) {
    if (!tripId || !selectedDate) return;
    const normalized = next.map((stop, index) => ({ ...stop, order: index + 1, start_time: isValidHhMm(stop.start_time) ? stop.start_time : null, end_time: isValidHhMm(stop.end_time) ? stop.end_time : null }));
    setStops(normalized);
    setRoutePreview([]);
    try { await saveDraft.mutateAsync({ date: selectedDate, stops: normalized, source: 'manual' }); }
    catch (error) { showError('保存行程草稿', error); }
  }

  function isInToday(placeId: string) { return stops.some((stop) => stop.place_id === placeId); }

  async function addToToday(placeId: string, title: string) {
    if (isInToday(placeId)) return;
    const start = stops.length ? null : '09:00';
    await persistStops([...stops, { place_id: placeId, title, start_time: start, end_time: start ? addMinutes(start, 90) : null, order: stops.length + 1, preferred_duration_minutes: 90 }]);
    selectPlace(placeId);
    setMobileTab('itinerary');
  }

  async function removeFromToday(placeId: string) { await persistStops(stops.filter((stop) => stop.place_id !== placeId)); }
  async function moveStop(placeId: string, direction: -1 | 1) {
    const index = stops.findIndex((stop) => stop.place_id === placeId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= stops.length) return;
    const next = stops.slice();
    [next[index], next[target]] = [next[target], next[index]];
    await persistStops(next);
  }
  function updateStopTimeLocal(placeId: string, start: string, duration: number) {
    const safeDuration = Math.min(Math.max(duration || 90, 15), 480);
    const startTime = isValidHhMm(start) ? start : null;
    setStops((current) => current.map((stop) => stop.place_id === placeId ? { ...stop, start_time: startTime, end_time: startTime ? addMinutes(startTime, safeDuration) : null, preferred_duration_minutes: safeDuration } : stop));
    setRoutePreview([]);
  }
  async function commitStopTime() { await persistStops(stopsRef.current); }

  async function handleAiPlan() {
    if (!tripId || !selectedDate) return;
    const placeIds = pool.map((item) => item.place_id);
    if (placeIds.length < 2) { setToast('请先在地点库加入至少 2 个地点'); return; }
    try {
      const result = await aiPlan.mutateAsync({ date: selectedDate, place_ids: placeIds.slice(0, 8), day_start: '09:00', day_end: '21:00' });
      setStops(result.stops); setRoutePreview([]);
      if (result.stops[0]) selectPlace(result.stops[0].place_id);
    } catch (error) { showError('AI 规划', error); }
  }
  async function handleGenerateRoutes() {
    if (!tripId || !selectedDate) return;
    try {
      const saved = await saveDraft.mutateAsync({ date: selectedDate, stops, source: 'manual' });
      const result = await generateRoutes.mutateAsync({ draftId: saved.id, routeType });
      setRoutePreview(result.segments);
      const conflicts = result.segments.filter((segment) => segment.time_conflict).length;
      if (conflicts) setToast(`有 ${conflicts} 段交通时长可能超过空档，请调整停留时间后再保存`);
    } catch (error) { showError('生成路线', error); }
  }
  async function handleConfirm() {
    if (!tripId || !selectedDate) return;
    try {
      const saved = await saveDraft.mutateAsync({ date: selectedDate, stops, source: 'manual' });
      await confirmDraft.mutateAsync({ draftId: saved.id, routeType });
      setRoutePreview([]); setToast('行程已保存，可在已保存行程中查看');
    } catch (error) { showError('保存行程', error); }
  }
  async function softRemove(tripPlaceId: string) {
    try { await updateTripPlace.mutateAsync({ tripPlaceId, status: 'removed' }); }
    catch (error) { showError('移除地点', error); }
  }

  if (tripLoading) return <div className="md-empty page-pad">加载旅行…</div>;
  if (tripError || !trip || !tripId) return <div className="page-pad"><div className="md-banner md-banner--error">旅行不存在或加载失败</div><Link to="/">返回列表</Link></div>;

  const savedHref = selectedDate ? `/trips/${tripId}/saved?date=${encodeURIComponent(selectedDate)}` : `/trips/${tripId}/saved`;
  return (
    <div className="planner-workspace" data-mobile-tab={mobileTab}>
      <PlannerSidebar savedHref={savedHref} />
      <main className="planner-main">
        <header className="planner-header">
          <div className="planner-header__trip"><Link to="/" className="planner-back">返回旅行</Link><div><span className="planner-kicker">旅行日程</span><h1>{trip.name}</h1><p>{trip.city_name} · {trip.start_date} - {trip.end_date} · {dates.length} 天</p></div></div>
          <div className="planner-date-tabs" aria-label="选择日期">{dates.map((date) => <button key={date} type="button" className={date === selectedDate ? 'is-active' : ''} onClick={() => selectDate(date)} aria-pressed={date === selectedDate}>{date.slice(5)}</button>)}</div>
          <button type="button" className="planner-primary-action planner-header__ai" onClick={handleAiPlan} disabled={aiPlan.isPending || pool.length < 2}>{aiPlan.isPending ? '正在规划…' : 'AI 规划'}</button>
        </header>

        <section className="planner-search" aria-label="搜索地点"><label htmlFor="planner-place-search">搜索并添加地点</label><input id="planner-place-search" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={`搜索${trip.city_name}的火车站、机场或景点`} autoComplete="off" />{keyword && <button type="button" className="planner-search__clear" onClick={() => setKeyword('')} aria-label="清空搜索">清空</button>}{search.isFetching && <span className="planner-search__status">搜索中…</span>}{search.isError && <p className="planner-search__empty" role="alert">暂时无法获取地点，请稍后重试。</p>}{debounced && !search.isFetching && !search.isError && search.data?.length === 0 && <p className="planner-search__empty">暂时没有匹配地点，换一个关键词试试。</p>}{debounced && search.data && search.data.length > 0 && <ul className="planner-search__results">{search.data.map((hit) => <li key={`${hit.amap_poi_id ?? hit.name}-${hit.lng}`}><button type="button" onClick={() => handleAddSearchHit(hit)}><strong>{hit.name}</strong><span>{hit.address || hit.district || '点击加入地点库'}</span></button></li>)}</ul>}</section>

        {!hintsLoading && cityHints?.places?.length ? <div className="planner-suggestions"><span>城市推荐</span>{cityHints.places.slice(0, 4).map((hit) => <button key={hit.amap_poi_id ?? hit.name} type="button" onClick={() => handleAddSearchHit(hit)} disabled={createPlace.isPending}>{hit.name}</button>)}</div> : null}

        <nav className="planner-mobile-tabs" aria-label="规划视图"><button type="button" className={mobileTab === 'itinerary' ? 'is-active' : ''} onClick={() => setMobileTab('itinerary')}>行程</button><button type="button" className={mobileTab === 'places' ? 'is-active' : ''} onClick={() => setMobileTab('places')}>地点</button><button type="button" className={mobileTab === 'map' ? 'is-active' : ''} onClick={() => setMobileTab('map')}>地图</button></nav>

        <div className="planner-content">
          <PlaceLibrary places={pool} selectedPlaceId={selectedPlaceId} isLoading={placesLoading} isAdding={createPlace.isPending} onAdd={addToToday} onRemove={softRemove} onSelect={selectPlace} isInToday={isInToday} />
          <ItineraryTimeline stops={stops} places={mapPlaces} segments={routePreview} routeType={routeType} isGenerating={generateRoutes.isPending} isSaving={confirmDraft.isPending} canGenerate={canGenerate} selectedPlaceId={selectedPlaceId} onSelect={selectPlace} onRouteType={setRouteType} onTimeChange={updateStopTimeLocal} onTimeCommit={commitStopTime} onMove={moveStop} onRemove={removeFromToday} onGenerate={handleGenerateRoutes} onConfirm={handleConfirm} />
          <PlannerMapPanel center={mapCenter} places={mapPlaces} markerLabels={markerLabels} selectedPlaceId={selectedPlaceId} focus={mapFocus} polylines={polylines} routeType={routeType} onSelect={selectPlace} />
        </div>
        <footer className="planner-mobile-actions"><button type="button" className="planner-primary-action" disabled={!canGenerate || generateRoutes.isPending} onClick={handleGenerateRoutes}>{generateRoutes.isPending ? '计算中…' : '生成路线'}</button><button type="button" className="planner-secondary-action" disabled={!routePreview.length || confirmDraft.isPending} onClick={handleConfirm}>保存行程</button></footer>
        {savedItems && savedItems.length > 0 && <Link className="planner-saved-link" to={savedHref}>查看已保存行程（{savedItems.length} 项）</Link>}
      </main>
      <PlannerToast message={toast} onClose={() => setToast(null)} />
    </div>
  );
}
