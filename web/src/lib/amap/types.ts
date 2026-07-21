/** Minimal AMap typings for the loader phase (no Marker/Polyline yet). */

export type AMapNamespace = {
  Map: new (
    container: string | HTMLElement,
    opts?: {
      viewMode?: '2D' | '3D';
      zoom?: number;
      center?: [number, number];
    },
  ) => {
    destroy: () => void;
  };
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
