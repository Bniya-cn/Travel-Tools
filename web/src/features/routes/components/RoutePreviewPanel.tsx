import { useEffect, useState } from 'react';
import { useCreateRouteSegment, useRoutePreview } from '../../../hooks/useRoutes';
import { ApiClientError } from '../../../types/api';
import type { RouteType } from '../../../types/route';
import { RoutePolyline } from './RoutePolyline';

interface Props {
  tripId: string;
  date: string;
  afterItemId: string | null;
  beforeItemId: string | null;
  onPolylineChange: (path: [number, number][]) => void;
  onPersisted: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

export function RoutePreviewPanel({
  tripId,
  date,
  afterItemId,
  beforeItemId,
  onPolylineChange,
  onPersisted,
}: Props) {
  const [routeType, setRouteType] = useState<RouteType>('transit');
  const [persistError, setPersistError] = useState<string | null>(null);
  const enabled = Boolean(afterItemId && beforeItemId);
  const preview = useRoutePreview(routeType, afterItemId, beforeItemId, enabled);
  const createSeg = useCreateRouteSegment(tripId, date);

  const route = preview.data?.route;

  useEffect(() => {
    if (route?.polyline) {
      onPolylineChange(route.polyline as [number, number][]);
    } else {
      onPolylineChange([]);
    }
  }, [route, onPolylineChange]);

  async function handleUseRoute() {
    if (!preview.data || !afterItemId || !beforeItemId) return;
    setPersistError(null);
    try {
      await createSeg.mutateAsync({
        after_item_id: afterItemId,
        before_item_id: beforeItemId,
        route_type: routeType,
        strategy: preview.data.route.strategy,
        preview_token: preview.data.preview_token,
      });
      onPersisted();
    } catch (err) {
      setPersistError(err instanceof ApiClientError ? err.message : '确认路线失败');
    }
  }

  return (
    <div className="route-preview">
      <h3>路线预览</h3>
      {!enabled && <p className="md-muted">选择两个带地点的相邻活动后可预览路线</p>}
      {enabled && (
        <div className="route-preview__tabs">
          <button
            type="button"
            className={routeType === 'transit' ? 'is-active' : ''}
            onClick={() => setRouteType('transit')}
          >
            公交
          </button>
          <button
            type="button"
            className={routeType === 'walking' ? 'is-active' : ''}
            onClick={() => setRouteType('walking')}
          >
            步行
          </button>
        </div>
      )}
      {preview.isFetching && <p className="md-muted">路线计算中…</p>}
      {preview.isError && (
        <div className="md-banner md-banner--error">
          {preview.error instanceof ApiClientError ? preview.error.message : '路线预览失败'}
        </div>
      )}
      {persistError && <div className="md-banner md-banner--error">{persistError}</div>}
      {route && (
        <div className="route-preview__body">
          <p>
            方式：{route.route_type === 'transit' ? '公交' : '步行'}
            {preview.data?.cache_hit ? '（缓存）' : ''}
          </p>
          <p>时间：{formatDuration(route.duration_seconds)}</p>
          <p>距离：{(route.distance_meters / 1000).toFixed(1)} km</p>
          {route.route_type === 'transit' && <p>换乘：{route.transfer_count} 次</p>}
          <RoutePolyline path={route.polyline as [number, number][]} />
          <button
            type="button"
            className="md-btn md-btn--primary"
            onClick={handleUseRoute}
            disabled={createSeg.isPending}
          >
            {createSeg.isPending ? '保存中…' : '使用此路线'}
          </button>
        </div>
      )}
    </div>
  );
}
