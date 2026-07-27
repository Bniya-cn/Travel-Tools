/** AMap typings — Map + Marker + Polyline. */

export type LngLatLike = [number, number];

export type AMapMarker = {
  setMap: (map: AMapMap | null) => void;
  on: (event: string, handler: () => void) => void;
  getExtData: () => unknown;
  setExtData: (data: unknown) => void;
};

export type AMapPolyline = {
  setMap: (map: AMapMap | null) => void;
  setPath: (path: LngLatLike[]) => void;
};

export type AMapOverlay = AMapMarker | AMapPolyline;

export type AMapMap = {
  destroy: () => void;
  clearMap: () => void;
  setCenter: (center: LngLatLike) => void;
  setZoom: (zoom: number) => void;
  setZoomAndCenter: (zoom: number, center: LngLatLike) => void;
  resize?: () => void;
  setFitView?: (
    overlays?: AMapOverlay[] | null,
    immediately?: boolean,
    avoid?: number[],
  ) => void;
  add: (overlay: AMapOverlay | AMapOverlay[]) => void;
  remove: (overlay: AMapOverlay | AMapOverlay[]) => void;
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
  Polyline: new (opts: {
    path: LngLatLike[];
    strokeColor?: string;
    strokeWeight?: number;
    strokeOpacity?: number;
  }) => AMapPolyline;
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
