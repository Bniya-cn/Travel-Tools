import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Trash2, Clock, Footprints, Bus } from 'lucide-react';
import { RouteGenerationRive } from '../RouteGenerationRive';
import { PlaceTypeGlyph } from './PlaceTypeGlyph';
import { formatDuration, getPlacePresentation } from './plannerUtils';
import type { DraftRouteSegmentPreview, DraftStop } from '../../types/workspace';
import type { Place } from '../../types/place';

type Props = {
  stops: DraftStop[];
  places: Place[];
  segments: DraftRouteSegmentPreview[];
  routeType: 'transit' | 'walking';
  isGenerating: boolean;
  isSaving: boolean;
  canGenerate: boolean;
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
  onRouteType: (type: 'transit' | 'walking') => void;
  onTimeChange: (placeId: string, start: string, duration: number) => void;
  onTimeCommit: () => void;
  onMove?: (placeId: string, direction: -1 | 1) => void; // 保留兼容，主要使用 onReorder
  onReorder: (stops: DraftStop[]) => void; // 新增拖拽排序接口
  onRemove: (placeId: string) => void;
  onGenerate: () => void;
  onConfirm: () => void;
  showRouteControls?: boolean;
};

interface EntryProps {
  stop: DraftStop;
  index: number;
  placeById: Map<string, Place>;
  segment: DraftRouteSegmentPreview | undefined;
  routeType: 'transit' | 'walking';
  selectedPlaceId: string | null;
  onSelect: (placeId: string) => void;
  onTimeChange: (placeId: string, start: string, duration: number) => void;
  onTimeCommit: () => void;
  onRemove: (placeId: string) => void;
}

function TimelineEntry({
  stop,
  placeById,
  segment,
  routeType,
  selectedPlaceId,
  onSelect,
  onTimeChange,
  onTimeCommit,
  onRemove
}: EntryProps) {
  const dragControls = useDragControls();
  const place = placeById.get(stop.place_id);
  const presentation = place ? getPlacePresentation(place) : { kind: 'other' as const, label: '地点' };
  const isSelected = selectedPlaceId === stop.place_id;

  return (
    <Reorder.Item
      value={stop}
      id={stop.place_id}
      dragListener={false}
      dragControls={dragControls}
      className="planner-timeline__entry"
      style={{ position: 'relative' }}
    >
      <span className="planner-timeline__time">
        <Clock size={11} style={{ marginRight: '3px', verticalAlign: 'middle', display: 'inline-block' }} />
        {stop.start_time || '待定'}
      </span>
      <article className={isSelected ? 'planner-stop-card is-selected' : 'planner-stop-card'}>
        <div
          className="planner-stop-card__drag-handle"
          onPointerDown={(e) => {
            e.preventDefault();
            dragControls.start(e);
          }}
          aria-label="按住拖拽排序"
        >
          <GripVertical size={16} />
        </div>
        <button type="button" className="planner-stop-card__identity" onClick={() => onSelect(stop.place_id)}>
          <span className="planner-stop-card__glyph"><PlaceTypeGlyph kind={presentation.kind} /></span>
          <span className="planner-stop-card__title-box">
            <strong>{stop.title}</strong>
            <small>{presentation.label} · 建议停留 {stop.preferred_duration_minutes ?? 90} 分钟</small>
          </span>
        </button>
        <div className="planner-stop-card__fields">
          <label>开始<input type="time" value={stop.start_time ?? ''} onChange={(event) => onTimeChange(stop.place_id, event.target.value, stop.preferred_duration_minutes ?? 90)} onBlur={onTimeCommit} /></label>
          <label>停留<input type="number" min={15} max={480} value={stop.preferred_duration_minutes ?? 90} onChange={(event) => onTimeChange(stop.place_id, stop.start_time || '09:00', Number(event.target.value) || 90)} onBlur={onTimeCommit} /></label>
          <span className="planner-stop-card__end">至 {stop.end_time || '待定'}</span>
        </div>
        <div className="planner-stop-card__actions">
          <button type="button" className="planner-text-action is-danger" onClick={() => onRemove(stop.place_id)}>
            <Trash2 size={13} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
            移除
          </button>
        </div>
      </article>
      {segment && (
        <div className={segment.time_conflict ? 'planner-route-segment is-warning' : 'planner-route-segment'}>
          <span className="planner-route-segment__icon" style={{ display: 'inline-flex', alignItems: 'center', marginRight: '4px' }}>
            {routeType === 'walking' ? <Footprints size={13} /> : <Bus size={13} />}
          </span>
          <span>{routeType === 'walking' ? '步行' : '地铁 / 公交'}</span>
          <strong>{formatDuration(segment.route.duration_seconds)}</strong>
          <small>{(segment.route.distance_meters / 1000).toFixed(1)} km{segment.route.transfer_count ? ` · 换乘 ${segment.route.transfer_count}` : ''}</small>
        </div>
      )}
    </Reorder.Item>
  );
}

export function ItineraryTimeline(props: Props) {
  const placeById = new Map(props.places.map((place) => [place.id, place]));
  return (
    <section id="today-itinerary" className="planner-panel planner-itinerary" aria-labelledby="today-itinerary-title">
      <div className="planner-panel__heading">
        <div><span className="planner-kicker">今天的安排</span><h2 id="today-itinerary-title">今日行程</h2></div>
        <span className="planner-date-note">拖拽手柄排序</span>
      </div>
      {props.stops.length === 0 && <p className="planner-empty">今天还没有安排，先从地点库添加一个地点吧。</p>}
      <Reorder.Group axis="y" values={props.stops} onReorder={props.onReorder} className="planner-timeline">
        {props.stops.map((stop, index) => {
          const next = props.stops[index + 1];
          const segment = next ? props.segments.find((item) => item.from_place_id === stop.place_id && item.to_place_id === next.place_id) : undefined;
          return (
            <TimelineEntry
              key={stop.place_id}
              stop={stop}
              index={index}
              placeById={placeById}
              segment={segment}
              routeType={props.routeType}
              selectedPlaceId={props.selectedPlaceId}
              onSelect={props.onSelect}
              onTimeChange={props.onTimeChange}
              onTimeCommit={props.onTimeCommit}
              onRemove={props.onRemove}
            />
          );
        })}
      </Reorder.Group>
      {props.showRouteControls !== false && <div className="planner-route-controls">
        <div className="planner-route-mode" aria-label="路线类型">
          <button type="button" className={props.routeType === 'transit' ? 'is-active' : ''} onClick={() => props.onRouteType('transit')}>公交 / 地铁</button>
          <button type="button" className={props.routeType === 'walking' ? 'is-active' : ''} onClick={() => props.onRouteType('walking')}>步行</button>
        </div>
        <button type="button" className="planner-primary-action planner-ai-button" disabled={!props.canGenerate || props.isGenerating} onClick={props.onGenerate}><RouteGenerationRive active={props.isGenerating} />{props.isGenerating ? '正在计算…' : '生成路线'}</button>
        <button type="button" className="planner-secondary-action" disabled={!props.segments.length || props.isSaving} onClick={props.onConfirm}>{props.isSaving ? '保存中…' : '保存行程'}</button>
      </div>}
    </section>
  );
}
