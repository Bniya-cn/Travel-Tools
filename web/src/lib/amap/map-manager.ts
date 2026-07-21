import type { AMapMap, AMapNamespace, LngLatLike } from './types';

export type MapManager = {
  map: AMapMap;
  destroy: () => void;
  setCenter: (lng: number, lat: number, zoom?: number) => void;
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
    destroy() {
      if (destroyed) return;
      destroyed = true;
      map.destroy();
    },
  };
}
