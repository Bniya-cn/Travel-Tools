import type { AMapMap, AMapNamespace, AMapPolyline, LngLatLike } from './types';

/**
 * Single polyline manager — replace on update, remove on clear/unmount.
 */
export class PolylineManager {
  private readonly AMap: AMapNamespace;
  private readonly map: AMapMap;
  private polyline: AMapPolyline | null = null;

  constructor(AMap: AMapNamespace, map: AMapMap) {
    this.AMap = AMap;
    this.map = map;
  }

  update(path: LngLatLike[]): void {
    this.clear();
    if (path.length < 2) return;
    this.polyline = new this.AMap.Polyline({
      path,
      strokeColor: '#1a73e8',
      strokeWeight: 5,
      strokeOpacity: 0.85,
    });
    this.map.add(this.polyline);
  }

  clear(): void {
    if (!this.polyline) return;
    this.polyline.setMap(null);
    this.map.remove(this.polyline);
    this.polyline = null;
  }
}
