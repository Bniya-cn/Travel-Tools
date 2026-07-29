import { describe, expect, it, vi } from 'vitest';
import { MarkerManager } from './marker-manager';
import type { AMapMap, AMapNamespace } from './types';

function createFakeAMap() {
  const Marker = vi.fn(function Marker(
    this: {
      setMap: ReturnType<typeof vi.fn>;
      setExtData: ReturnType<typeof vi.fn>;
      getExtData: ReturnType<typeof vi.fn>;
      on: ReturnType<typeof vi.fn>;
      setLabel: ReturnType<typeof vi.fn>;
    },
    opts: { position: [number, number]; title: string; extData?: unknown },
  ) {
    this.setMap = vi.fn();
    let extData = opts.extData;
    this.setExtData = vi.fn((value) => { extData = value; });
    this.getExtData = vi.fn(() => extData);
    this.on = vi.fn();
    this.setLabel = vi.fn();
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

  it('forwards marker click and updates selected marker styling', () => {
    const { AMap, map, Marker } = createFakeAMap();
    const onSelect = vi.fn();
    const mgr = new MarkerManager(AMap, map);

    mgr.updateMarkers([{ id: 'a', position: [108, 34], title: 'A', label: '①', onSelect }]);
    const marker = Marker.mock.instances[0] as {
      on: ReturnType<typeof vi.fn>;
      setLabel: ReturnType<typeof vi.fn>;
    };
    const clickHandler = marker.on.mock.calls[0][1] as () => void;
    clickHandler();
    expect(onSelect).toHaveBeenCalledWith('a');

    mgr.updateMarkers([{ id: 'a', position: [108, 34], title: 'A', label: '①', selected: true, onSelect }]);
    expect(marker.setLabel).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining('is-selected') }));
  });
});
