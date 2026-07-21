import type { AMapMap, AMapMarker, AMapNamespace, LngLatLike } from './types';

export type MarkerData = {
  id: string;
  position: LngLatLike;
  title: string;
};

/**
 * Diff-based marker manager — avoids recreating all markers on every update.
 */
export class MarkerManager {
  private readonly AMap: AMapNamespace;
  private readonly map: AMapMap;
  private markers = new Map<string, AMapMarker>();

  constructor(AMap: AMapNamespace, map: AMapMap) {
    this.AMap = AMap;
    this.map = map;
  }

  /** Initial create — same as updateMarkers for empty manager. */
  createMarkers(items: MarkerData[]): void {
    this.updateMarkers(items);
  }

  updateMarkers(items: MarkerData[]): void {
    const nextIds = new Set(items.map((i) => i.id));

    for (const [id, marker] of this.markers) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        this.map.remove(marker);
        this.markers.delete(id);
      }
    }

    for (const item of items) {
      const existing = this.markers.get(item.id);
      if (existing) {
        existing.setExtData(item);
        continue;
      }
      const marker = new this.AMap.Marker({
        position: item.position,
        title: item.title,
        extData: item,
      });
      this.map.add(marker);
      this.markers.set(item.id, marker);
    }
  }

  clearMarkers(): void {
    for (const marker of this.markers.values()) {
      marker.setMap(null);
      this.map.remove(marker);
    }
    this.markers.clear();
  }
}
