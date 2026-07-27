import type { AMapMap, AMapNamespace, LngLatLike } from './types';

export type MapManager = {
  map: AMapMap;
  destroy: () => void;
  setCenter: (lng: number, lat: number, zoom?: number) => void;
  resize: () => void;
  fitView: () => void;
};

/**
 * Create a 2D map instance. Caller must destroy on unmount.
 */
export function createMap(
  AMap: AMapNamespace,
  container: HTMLElement,
  center: LngLatLike,
  zoom = 12,
): MapManager {
  const map = new AMap.Map(container, {
    viewMode: '2D',
    zoom,
    center,
  });

  let destroyed = false;

  return {
    map,
    setCenter(lng: number, lat: number, nextZoom?: number) {
      if (destroyed) return;
      if (typeof nextZoom === 'number') {
        map.setZoomAndCenter(nextZoom, [lng, lat]);
      } else {
        map.setCenter([lng, lat]);
      }
    },
    resize() {
      if (destroyed) return;
      map.resize?.();
    },
    fitView() {
      if (destroyed) return;
      // 让路线/点位进入视野，同时触发底图瓦片重绘
      map.setFitView?.(undefined, false, [48, 48, 48, 48]);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      map.destroy();
    },
  };
}
