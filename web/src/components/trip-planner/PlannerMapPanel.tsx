import { AmapMap, type MapFocus } from '../../features/map/components/AmapMap';
import { PlaceTypeGlyph } from './PlaceTypeGlyph';
import { getPlacePresentation } from './plannerUtils';
import type { Place } from '../../types/place';
import type { LngLatTuple } from '../../types/route';

type Props = {
  center: { lng: number; lat: number };
  places: Place[];
  markerLabels: Record<string, string>;
  selectedPlaceId: string | null;
  focus: MapFocus;
  polylines: LngLatTuple[][];
  routeType: 'transit' | 'walking';
  onSelect: (placeId: string) => void;
};

export function PlannerMapPanel({ center, places, markerLabels, selectedPlaceId, focus, polylines, routeType, onSelect }: Props) {
  const selected = places.find((place) => place.id === selectedPlaceId) ?? null;
  const presentation = selected ? getPlacePresentation(selected) : null;
  const routeStyle = useMemo(
    () => (routeType === 'walking' ? { color: '#ef668f', dashed: true } : { color: '#4e99a0' }),
    [routeType],
  );
  return (
    <section id="map-panel" className="planner-map-column" aria-labelledby="planner-map-title">
      <div className="planner-map-card">
        <div className="planner-map-card__heading"><div><span className="planner-kicker">行程地图</span><h2 id="planner-map-title">路线预览</h2></div><span className={routeType === 'walking' ? 'planner-route-key is-walking' : 'planner-route-key'}>{routeType === 'walking' ? '步行路线' : '公交 / 地铁'}</span></div>
        <AmapMap className="planner-amap" center={center} markers={places} markerLabels={markerLabels} selectedMarkerId={selectedPlaceId} focus={focus} polylines={polylines} routeStyle={routeStyle} autoFit={polylines.length > 0} onMarkerSelect={onSelect} />
      </div>
      <section className="planner-selected-detail" aria-live="polite">
        {selected && presentation ? <><span className="planner-selected-detail__glyph"><PlaceTypeGlyph kind={presentation.kind} size={22} /></span><div><span className="planner-kicker">当前选中地点</span><h2>{selected.name}</h2><p>{presentation.label} · {selected.district || selected.city_name || '未标注区域'}</p><p className="planner-selected-detail__address">{selected.address || '暂未提供详细地址'}</p></div></> : <p className="planner-empty">从地点库、行程卡片或地图标记中选择一个地点。</p>}
      </section>
    </section>
  );
}
import { useMemo } from 'react';
