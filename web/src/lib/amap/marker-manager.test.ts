import { describe, expect, it, vi } from 'vitest';
import { MarkerManager } from './marker-manager';
import type { AMapMap, AMapNamespace } from './types';

function createFakeAMap() {
  const Marker = vi.fn(function Marker(
    this: { setMap: ReturnType<typeof vi.fn>; setExtData: ReturnType<typeof vi.fn> },
    _opts: { position: [number, number]; title: string },
  ) {
    this.setMap = vi.fn();
    this.setExtData = vi.fn();
  });
  const map: AMapMap = {
    add: vi.fn(),
    remove: vi.fn(),
    destroy: vi.fn(),
    clearMap: vi.fn(),
    setCenter: vi.fn(),
    setZoom: vi.fn(),
    setZoomAndCenter: vi.fn(),
  };
  return { AMap: { Map: vi.fn(), Marker } as unknown as AMapNamespace, map, Marker };
}

describe('MarkerManager', () => {
  it('creates markers and skips full recreate on same ids', () => {
    const { AMap, map, Marker } = createFakeAMap();
    const mgr = new MarkerManager(AMap, map);

    mgr.updateMarkers([{ id: 'a', position: [108, 34], title: 'A' }]);
    expect(Marker).toHaveBeenCalledTimes(1);
    expect(map.add).toHaveBeenCalledTimes(1);

    mgr.updateMarkers([{ id: 'a', position: [108, 34], title: 'A' }]);
    expect(Marker).toHaveBeenCalledTimes(1);

    mgr.updateMarkers([
      { id: 'a', position: [108, 34], title: 'A' },
      { id: 'b', position: [109, 35], title: 'B' },
    ]);
    expect(Marker).toHaveBeenCalledTimes(2);

    mgr.clearMarkers();
    expect(map.remove).toHaveBeenCalled();
  });
});
