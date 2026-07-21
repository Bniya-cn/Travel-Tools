import type { LngLatTuple } from '../../../types/route';

/** Presentational wrapper — polyline is rendered by AmapMap via props. */
export function RoutePolyline({ path }: { path: LngLatTuple[] }) {
  if (path.length < 2) {
    return <p className="md-muted">暂无路线折线</p>;
  }
  return (
    <p className="md-muted route-polyline-meta">
      路线折线 {path.length} 个坐标点（已绘制到地图）
    </p>
  );
}
