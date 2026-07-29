import type { AMapMap, AMapNamespace, AMapPolyline, LngLatLike } from './types';

const SEGMENT_COLORS = ['#1a73e8', '#ea580c', '#0d9488', '#7c3aed', '#db2777'];

export type PolylineStyle = {
  color?: string;
  dashed?: boolean;
};

/**
 * Polyline manager — supports a single path or multi-segment colored paths.
 */
export class PolylineManager {
  private readonly AMap: AMapNamespace;
  private readonly map: AMapMap;
  private polylines: AMapPolyline[] = [];

  constructor(AMap: AMapNamespace, map: AMapMap) {
    this.AMap = AMap;
    this.map = map;
  }

  update(path: LngLatLike[], style?: PolylineStyle): void {
    this.clear();
    if (path.length < 2) return;
    this._add(path, style?.color ?? SEGMENT_COLORS[0], style);
  }

  /** Draw multiple segments with alternating colors. */
  updateSegments(paths: LngLatLike[][], style?: PolylineStyle): void {
    this.clear();
    paths.forEach((path, i) => {
      if (path.length < 2) return;
      this._add(path, style?.color ?? SEGMENT_COLORS[i % SEGMENT_COLORS.length], style);
    });
  }

  private _add(path: LngLatLike[], color: string, style?: PolylineStyle): void {
    const line = new this.AMap.Polyline({
      path,
      strokeColor: color,
      strokeWeight: 5,
      strokeOpacity: 0.85,
      strokeStyle: style?.dashed ? 'dashed' : 'solid',
    });
    this.map.add(line);
    this.polylines.push(line);
  }

  clear(): void {
    for (const line of this.polylines) {
      line.setMap(null);
      this.map.remove(line);
    }
    this.polylines = [];
  }
}
