/** Minimal AMap typings — Map + Marker only (no Polyline in this phase). */

export type LngLatLike = [number, number];

export type AMapMarker = {
  setMap: (map: AMapMap | null) => void;
  on: (event: string, handler: () => void) => void;
  getExtData: () => unknown;
  setExtData: (data: unknown) => void;
};

export type AMapMap = {
  destroy: () => void;
  clearMap: () => void;
  setCenter: (center: LngLatLike) => void;
  setZoom: (zoom: number) => void;
  setZoomAndCenter: (zoom: number, center: LngLatLike) => void;
  add: (overlay: AMapMarker | AMapMarker[]) => void;
  remove: (overlay: AMapMarker | AMapMarker[]) => void;
};

export type AMapNamespace = {
  Map: new (
    container: string | HTMLElement,
    opts?: {
      viewMode?: '2D' | '3D';
      zoom?: number;
      center?: LngLatLike;
    },
  ) => AMapMap;
  Marker: new (opts: {
    position: LngLatLike;
    title?: string;
    extData?: unknown;
  }) => AMapMarker;
};

declare global {
  interface Window {
    _AMapSecurityConfig?: {
      securityJsCode?: string;
      serviceHost?: string;
    };
  }
}

export {};
