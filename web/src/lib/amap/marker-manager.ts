import type { AMapMap, AMapMarker, AMapNamespace, LngLatLike } from './types';

export type MarkerData = {
  id: string;
  position: LngLatLike;
  title: string;
  /** Optional map label e.g. "①" */
  label?: string;
  selected?: boolean;
  onSelect?: (id: string) => void;
};

function labelContent(item: MarkerData): string | undefined {
  if (!item.label) return undefined;
  return `<span class="amap-marker-label${item.selected ? ' is-selected' : ''}">${item.label}</span>`;
}

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
        if (typeof (existing as { setPosition?: (p: LngLatLike) => void }).setPosition === 'function') {
          (existing as { setPosition: (p: LngLatLike) => void }).setPosition(item.position);
        }
        if (item.label && typeof (existing as { setLabel?: (o: unknown) => void }).setLabel === 'function') {
          (existing as { setLabel: (o: unknown) => void }).setLabel({
            content: labelContent(item),
            direction: 'top',
          });
        }
        continue;
      }
      const marker = new this.AMap.Marker({
        position: item.position,
        title: item.title,
        extData: item,
        label: item.label
          ? { content: labelContent(item)!, direction: 'top' }
          : undefined,
      });
      marker.on('click', () => {
        const current = marker.getExtData() as MarkerData;
        current.onSelect?.(current.id);
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
