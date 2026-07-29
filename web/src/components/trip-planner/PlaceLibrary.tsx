import type { TripPlace } from '../../types/workspace';
import { PlaceTypeGlyph } from './PlaceTypeGlyph';
import { getPlacePresentation, type PlaceKind } from './plannerUtils';

type Props = {
  places: TripPlace[];
  selectedPlaceId: string | null;
  isLoading: boolean;
  isAdding: boolean;
  onAdd: (placeId: string, name: string) => void;
  onRemove: (tripPlaceId: string) => void;
  onSelect: (placeId: string) => void;
  isInToday: (placeId: string) => boolean;
};

const groupOrder: PlaceKind[] = ['transport', 'attraction', 'museum', 'restaurant', 'hotel', 'subway', 'other'];

export function PlaceLibrary({ places, selectedPlaceId, isLoading, isAdding, onAdd, onRemove, onSelect, isInToday }: Props) {
  const grouped = groupOrder.map((kind) => ({
    kind,
    items: places.filter((item) => item.place && getPlacePresentation(item.place).kind === kind),
  })).filter((group) => group.items.length > 0);

  return (
    <section id="place-library" className="planner-panel planner-library" aria-labelledby="place-library-title">
      <div className="planner-panel__heading">
        <div><span className="planner-kicker">探索目的地</span><h2 id="place-library-title">地点库</h2></div>
        <span className="planner-count">{places.length} 个地点</span>
      </div>
      {isLoading && <div className="planner-skeleton planner-skeleton--list" aria-label="地点加载中" />}
      {!isLoading && places.length === 0 && <p className="planner-empty">还没有收藏地点，搜索一个想去的地方吧。</p>}
      {grouped.map(({ kind, items }) => {
        const presentation = getPlacePresentation(items[0].place!);
        return (
          <section key={kind} className="planner-place-group" aria-label={presentation.label}>
            <h3><PlaceTypeGlyph kind={kind} size={15} /> {presentation.label}</h3>
            <ul>
              {items.map((tripPlace) => {
                const place = tripPlace.place!;
                const display = getPlacePresentation(place);
                const inToday = isInToday(tripPlace.place_id);
                return (
                  <li key={tripPlace.id} className={selectedPlaceId === place.id ? 'planner-place-card is-selected' : 'planner-place-card'}>
                    <button type="button" className="planner-place-card__main" onClick={() => onSelect(place.id)}>
                      <span className="planner-place-card__glyph"><PlaceTypeGlyph kind={display.kind} /></span>
                      <span><strong>{place.name}</strong><small>{place.district || place.address || display.label}</small></span>
                    </button>
                    <div className="planner-place-card__actions">
                      <button type="button" disabled={inToday || isAdding} onClick={() => onAdd(place.id, place.name)}>
                        {inToday ? '已安排' : '加入'}
                      </button>
                      <button type="button" className="planner-text-action is-danger" onClick={() => onRemove(tripPlace.id)} aria-label={`移除${place.name}`}>移除</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </section>
  );
}
