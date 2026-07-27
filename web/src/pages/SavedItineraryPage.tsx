import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { AmapMap } from '../features/map/components/AmapMap';
import { RouteStepsList } from '../features/routes/components/RouteStepsList';
import { useItems } from '../hooks/useItems';
import { useTripRouteSegments } from '../hooks/useRoutes';
import { useTrip } from '../hooks/useTrips';
import { toLngLat } from '../types/place';
import type { Place } from '../types/place';
import type { ItineraryItem } from '../types/trip';
import type { LngLatTuple, RouteStep } from '../types/route';
import { categoryLabel, formatTimeLabel } from '../utils/dates';
import { simplifyRouteSteps } from '../utils/routeSteps';

const FALLBACK_CENTER = { lng: 113.2644, lat: 23.1291 };

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

function stepsForTransport(
  item: ItineraryItem,
  stepsByTransportId: Record<string, RouteStep[]>,
): RouteStep[] {
  const fromSeg = stepsByTransportId[item.id];
  if (fromSeg && fromSeg.length > 0) return simplifyRouteSteps(fromSeg);
  // 兼容：旧数据可能把摘要写在 description
  if (item.description) {
    return item.description
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((line) => !/左转|右转|直行/.test(line) || line.startsWith('步行约'))
      .map((line) => ({
        instruction: line,
        distance_meters: null,
        duration_seconds: null,
        mode: line.includes('地铁') || line.includes('公交') || line.includes('路') ? 'transit' : 'walking',
      }));
  }
  return [];
}

export function SavedItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams] = useSearchParams();
  const date = searchParams.get('date') || '';

  const { data: trip, isLoading: tripLoading, error: tripError } = useTrip(tripId);
  const { data: items, isLoading: itemsLoading } = useItems(tripId, date || undefined);
  const { data: segments, isLoading: segsLoading } = useTripRouteSegments(
    tripId,
    date || undefined,
  );

  const activityItems = useMemo(
    () => (items ?? []).filter((i) => i.kind !== 'transport'),
    [items],
  );
  const timedItems = useMemo(() => (items ?? []).filter((i) => !i.is_all_day), [items]);

  const stepsByTransportId = useMemo(() => {
    const map: Record<string, RouteStep[]> = {};
    for (const seg of segments ?? []) {
      map[seg.transport_item_id] = (seg.steps_json ?? []) as RouteStep[];
    }
    return map;
  }, [segments]);

  const mapPlaces = useMemo(() => {
    const places: Place[] = [];
    for (const item of activityItems) {
      if (item.place) places.push(item.place);
    }
    return places;
  }, [activityItems]);

  const markerLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    activityItems.forEach((item, i) => {
      if (item.place_id) labels[item.place_id] = String(i + 1);
    });
    return labels;
  }, [activityItems]);

  const polylines = useMemo(() => {
    return (segments ?? [])
      .map((s) => (s.polyline_json ?? []) as LngLatTuple[])
      .filter((p) => p.length >= 2);
  }, [segments]);

  const mapCenter = useMemo(() => {
    if (mapPlaces.length > 0) return toLngLat(mapPlaces[0]);
    return FALLBACK_CENTER;
  }, [mapPlaces]);

  if (tripLoading) {
    return <div className="md-empty page-pad">加载中…</div>;
  }
  if (tripError || !trip || !tripId) {
    return (
      <div className="page-pad">
        <div className="md-banner md-banner--error">旅行不存在或加载失败</div>
        <Link to="/">返回列表</Link>
      </div>
    );
  }
  if (!date) {
    return (
      <div className="page-pad">
        <div className="md-banner md-banner--error">缺少日期参数</div>
        <Link to={`/trips/${tripId}`}>返回规划</Link>
      </div>
    );
  }

  const loading = itemsLoading || segsLoading;

  return (
    <div className="saved-day">
      <header className="saved-day__top">
        <div className="saved-day__top-left">
          <Link to={`/trips/${tripId}?date=${date}`} className="md-link">
            ← 返回规划
          </Link>
          <div>
            <h1>已保存行程</h1>
            <p className="md-muted">
              {trip.name} · {trip.city_name} · {date}
            </p>
          </div>
        </div>
      </header>

      <div className="saved-day__layout">
        <div className="saved-day__map">
          <AmapMap
            className="amap-wrap--fullscreen"
            center={mapCenter}
            markers={mapPlaces}
            markerLabels={markerLabels}
            focus={null}
            polylines={polylines}
            autoFit
          />
        </div>

        <aside className="saved-day__panel">
          <h2>当日计划</h2>
          {loading && <p className="md-muted">加载行程…</p>}
          {!loading && timedItems.length === 0 && (
            <p className="md-muted">这一天还没有已保存行程。请先在规划页点「保存行程」。</p>
          )}
          <ol className="saved-day__list">
            {timedItems.map((item) => {
              const isTransport = item.kind === 'transport';
              const steps = isTransport ? stepsForTransport(item, stepsByTransportId) : [];
              const seg = (segments ?? []).find((s) => s.transport_item_id === item.id);
              return (
                <li
                  key={item.id}
                  className={isTransport ? 'saved-day__card is-transport' : 'saved-day__card'}
                >
                  <div className="saved-day__card-head">
                    <span className="saved-day__time">
                      {formatTimeLabel(item.start_time)} – {formatTimeLabel(item.end_time)}
                    </span>
                    <span className="saved-day__kind">
                      {isTransport ? '交通' : categoryLabel(item.category) || '活动'}
                    </span>
                  </div>
                  <h3 className="saved-day__title">{item.title}</h3>
                  {!isTransport && item.place?.name && (
                    <p className="md-muted saved-day__place">{item.place.name}</p>
                  )}
                  {isTransport && seg && (
                    <p className="md-muted saved-day__meta">
                      {seg.route_type === 'walking' ? '步行' : '地铁/公交'} ·{' '}
                      {formatDuration(seg.duration_seconds)}
                      {seg.transfer_count > 0 ? ` · 换乘 ${seg.transfer_count}` : ''}
                      {` · ${seg.origin_name} → ${seg.destination_name}`}
                    </p>
                  )}
                  {isTransport && steps.length > 0 && <RouteStepsList steps={steps} />}
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
