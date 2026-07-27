import { useEffect, useRef, useState } from 'react';
import { hasAmapJsKeyConfigured, loadAMap } from '../../../lib/amap/loader';
import { createMap, type MapManager } from '../../../lib/amap/map-manager';
import { MarkerManager } from '../../../lib/amap/marker-manager';
import { PolylineManager } from '../../../lib/amap/polyline-manager';
import { isAmapConfigError } from '../../../lib/amap/errors';
import type { Place } from '../../../types/place';
import { toLngLat } from '../../../types/place';
import type { LngLatTuple } from '../../../types/route';

export type MapFocus = { lng: number; lat: number } | null;

interface Props {
  center: { lng: number; lat: number };
  markers: Place[];
  /** Optional place_id -> display label (①②③) */
  markerLabels?: Record<string, string>;
  focus: MapFocus;
  polyline?: LngLatTuple[];
  /** Multi-leg polylines (phase 2+); takes precedence over polyline when non-empty */
  polylines?: LngLatTuple[][];
  className?: string;
  /** 有路线时自动 fitView，二级页建议开启 */
  autoFit?: boolean;
}

/** 等容器具备非零宽高再创建地图，避免灰底无瓦片。 */
function waitForMapSize(
  el: HTMLElement,
  isCancelled: () => boolean,
): Promise<boolean> {
  if (el.clientWidth > 0 && el.clientHeight > 0) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      ro.disconnect();
      resolve(ok);
    };
    const timer = window.setTimeout(() => {
      finish(el.clientWidth > 0 && el.clientHeight > 0);
    }, 2500);
    const ro = new ResizeObserver(() => {
      if (isCancelled()) {
        finish(false);
        return;
      }
      if (el.clientWidth > 0 && el.clientHeight > 0) finish(true);
    });
    ro.observe(el);
  });
}

function scheduleResizes(manager: MapManager, isCancelled: () => boolean) {
  const run = () => {
    if (!isCancelled()) manager.resize();
  };
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
  window.setTimeout(run, 80);
  window.setTimeout(run, 300);
}

export function AmapMap({
  center,
  markers,
  markerLabels = {},
  focus,
  polyline = [],
  polylines,
  className,
  autoFit = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<MapManager | null>(null);
  const markerMgrRef = useRef<MarkerManager | null>(null);
  const polyMgrRef = useRef<PolylineManager | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'no-key'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAmapJsKeyConfigured()) {
      setStatus('no-key');
      setErrorMessage('未配置高德 JS Key / 安全密钥，地图不可用（日程仍可使用）');
      return;
    }

    let cancelled = false;
    const isCancelled = () => cancelled;
    const container = containerRef.current;
    if (!container) return;

    setStatus('loading');
    (async () => {
      try {
        const sized = await waitForMapSize(container, isCancelled);
        if (cancelled || !containerRef.current) return;
        if (!sized) {
          setStatus('error');
          setErrorMessage('地图容器尺寸异常，请刷新页面重试');
          return;
        }
        const AMap = await loadAMap();
        if (cancelled || !containerRef.current) return;
        const manager = createMap(AMap, containerRef.current, [center.lng, center.lat], 12);
        managerRef.current = manager;
        markerMgrRef.current = new MarkerManager(AMap, manager.map);
        polyMgrRef.current = new PolylineManager(AMap, manager.map);
        scheduleResizes(manager, isCancelled);
        setStatus('ready');
      } catch (err: unknown) {
        if (cancelled) return;
        setStatus('error');
        if (isAmapConfigError(err)) {
          setErrorMessage(err.message);
        } else if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('地图加载失败');
        }
      }
    })();

    return () => {
      cancelled = true;
      polyMgrRef.current?.clear();
      polyMgrRef.current = null;
      markerMgrRef.current?.clearMarkers();
      markerMgrRef.current = null;
      managerRef.current?.destroy();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 容器尺寸变化时强制重算底图瓦片
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || status !== 'ready') return;
    const ro = new ResizeObserver(() => {
      managerRef.current?.resize();
    });
    ro.observe(el);
    if (containerRef.current) ro.observe(containerRef.current);
    managerRef.current?.resize();
    return () => ro.disconnect();
  }, [status]);

  useEffect(() => {
    if (status !== 'ready' || !markerMgrRef.current) return;
    markerMgrRef.current.updateMarkers(
      markers.map((p) => {
        const { lng, lat } = toLngLat(p);
        return {
          id: p.id,
          position: [lng, lat] as [number, number],
          title: p.name,
          label: markerLabels[p.id],
        };
      }),
    );
  }, [markers, markerLabels, status]);

  useEffect(() => {
    if (status !== 'ready' || !polyMgrRef.current) return;
    if (polylines && polylines.length > 0) {
      polyMgrRef.current.updateSegments(polylines as [number, number][][]);
    } else {
      polyMgrRef.current.update(polyline as [number, number][]);
    }
  }, [polyline, polylines, status]);

  // 路线/点位更新后：resize + 可选 fitView，避免二级页灰底
  useEffect(() => {
    if (status !== 'ready' || !managerRef.current) return;
    const manager = managerRef.current;
    manager.resize();
    const t = window.setTimeout(() => {
      manager.resize();
      if (autoFit && (markers.length > 0 || (polylines && polylines.length > 0) || polyline.length > 0)) {
        manager.fitView();
      }
    }, 120);
    return () => window.clearTimeout(t);
  }, [status, markers, polylines, polyline, autoFit]);

  useEffect(() => {
    if (status !== 'ready' || !managerRef.current || !focus) return;
    managerRef.current.setCenter(focus.lng, focus.lat, 15);
  }, [focus, status]);

  // 无手动 focus、且未 autoFit 时，跟随城市中心
  useEffect(() => {
    if (status !== 'ready' || !managerRef.current || focus || autoFit) return;
    managerRef.current.setCenter(center.lng, center.lat, 12);
  }, [center.lng, center.lat, focus, status, autoFit]);

  return (
    <div ref={wrapRef} className={className ? `amap-wrap ${className}` : 'amap-wrap'}>
      {(status === 'no-key' || status === 'error') && (
        <div className="amap-fallback" role="status">
          <p>{errorMessage}</p>
        </div>
      )}
      {status === 'loading' && <div className="amap-fallback">地图加载中…</div>}
      <div ref={containerRef} className="amap-canvas" aria-label="高德地图" />
    </div>
  );
}
