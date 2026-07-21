import { useEffect, useRef, useState } from 'react';
import { hasAmapJsKeyConfigured, loadAMap } from '../../../lib/amap/loader';
import { createMap, type MapManager } from '../../../lib/amap/map-manager';
import { MarkerManager } from '../../../lib/amap/marker-manager';
import { isAmapConfigError } from '../../../lib/amap/errors';
import type { Place } from '../../../types/place';
import { toLngLat } from '../../../types/place';

export type MapFocus = { lng: number; lat: number } | null;

interface Props {
  center: { lng: number; lat: number };
  markers: Place[];
  focus: MapFocus;
}

export function AmapMap({ center, markers, focus }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const managerRef = useRef<MapManager | null>(null);
  const markerMgrRef = useRef<MarkerManager | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'no-key'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasAmapJsKeyConfigured()) {
      setStatus('no-key');
      setErrorMessage('未配置高德 JS Key / 安全密钥，地图不可用（日程仍可使用）');
      return;
    }

    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setStatus('loading');
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        const manager = createMap(AMap, containerRef.current, [center.lng, center.lat], 12);
        managerRef.current = manager;
        markerMgrRef.current = new MarkerManager(AMap, manager.map);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus('error');
        if (isAmapConfigError(err)) {
          setErrorMessage(err.message);
        } else if (err instanceof Error) {
          setErrorMessage(err.message);
        } else {
          setErrorMessage('地图加载失败');
        }
      });

    return () => {
      cancelled = true;
      markerMgrRef.current?.clearMarkers();
      markerMgrRef.current = null;
      managerRef.current?.destroy();
      managerRef.current = null;
    };
    // Initialize once per mount; center/markers updated in separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'ready' || !markerMgrRef.current) return;
    markerMgrRef.current.updateMarkers(
      markers.map((p) => {
        const { lng, lat } = toLngLat(p);
        return { id: p.id, position: [lng, lat] as [number, number], title: p.name };
      }),
    );
  }, [markers, status]);

  useEffect(() => {
    if (status !== 'ready' || !managerRef.current || !focus) return;
    managerRef.current.setCenter(focus.lng, focus.lat, 15);
  }, [focus, status]);

  return (
    <div className="amap-wrap">
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
