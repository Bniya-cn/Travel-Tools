import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ItemForm } from '../features/itinerary/components/ItemForm';
import { Timeline } from '../features/itinerary/components/Timeline';
import { AmapMap, type MapFocus } from '../features/map/components/AmapMap';
import { PlaceSearch } from '../features/places/components/PlaceSearch';
import { RoutePreviewPanel } from '../features/routes/components/RoutePreviewPanel';
import { useCityCenter, useCityHints } from '../hooks/useCity';
import { useCreateItem, useDeleteItem, useItems } from '../hooks/useItems';
import { usePlaces } from '../hooks/usePlaces';
import { useTrip } from '../hooks/useTrips';
import { eachDate } from '../utils/dates';
import type { ItemCreateInput, ItineraryItem } from '../types/trip';
import type { Place } from '../types/place';
import { toLngLat } from '../types/place';
import type { LngLatTuple } from '../types/route';

const FALLBACK_CENTER = { lng: 104.0665, lat: 30.5723 };

export function TripPlannerPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: trip, isLoading: tripLoading, error: tripError } = useTrip(tripId);

  const dates = useMemo(
    () => (trip ? eachDate(trip.start_date, trip.end_date) : []),
    [trip],
  );

  const selectedDate = searchParams.get('date') || trip?.start_date || dates[0] || '';

  const { data: items, isLoading: itemsLoading } = useItems(tripId, selectedDate || undefined);
  const { data: places } = usePlaces(tripId);
  const { data: cityCenter } = useCityCenter(trip?.city_name);
  const { data: cityHints } = useCityHints(trip?.city_name);
  const createItem = useCreateItem(tripId || '');
  const deleteItem = useDeleteItem(tripId || '', selectedDate);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingPlaceId, setPendingPlaceId] = useState<string | null>(null);
  const [mapFocus, setMapFocus] = useState<MapFocus>(null);
  const [polyline, setPolyline] = useState<LngLatTuple[]>([]);

  const activityWithPlace = useMemo(() => {
    return (items ?? [])
      .filter((i) => i.kind === 'activity' && i.place_id && !i.is_all_day)
      .slice()
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
  }, [items]);

  const afterItemId = activityWithPlace[0]?.id ?? null;
  const beforeItemId = activityWithPlace[1]?.id ?? null;

  const mapCenter = useMemo(() => {
    if (places && places.length > 0) {
      return toLngLat(places[0]);
    }
    if (cityCenter) {
      return { lng: cityCenter.lng, lat: cityCenter.lat };
    }
    return FALLBACK_CENTER;
  }, [places, cityCenter]);

  const onPolylineChange = useCallback((path: [number, number][]) => {
    setPolyline(path);
  }, []);

  function selectDate(date: string) {
    setSearchParams({ date });
    setPolyline([]);
  }

  async function handleCreate(payload: ItemCreateInput) {
    await createItem.mutateAsync(payload);
    if (payload.date !== selectedDate) {
      selectDate(payload.date);
    }
    setPendingPlaceId(null);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteItem.mutateAsync(id);
    } finally {
      setDeletingId(null);
    }
  }

  function handlePlaceSaved(place: Place) {
    setPendingPlaceId(place.id);
    const { lng, lat } = toLngLat(place);
    setMapFocus({ lng, lat });
  }

  function handleFocusPlace(item: ItineraryItem) {
    if (!item.place) return;
    const { lng, lat } = toLngLat(item.place);
    setMapFocus({ lng, lat });
  }

  if (tripLoading) {
    return <div className="md-empty page-pad">加载旅行…</div>;
  }
  if (tripError || !trip || !tripId) {
    return (
      <div className="page-pad">
        <div className="md-banner md-banner--error">旅行不存在或加载失败</div>
        <Link to="/">返回列表</Link>
      </div>
    );
  }

  return (
    <div className="planner">
      <header className="planner__header">
        <div>
          <Link to="/" className="md-link">
            ← 返回
          </Link>
          <h1>{trip.name}</h1>
          <p className="md-muted">
            {trip.city_name} · {trip.start_date} ~ {trip.end_date}
          </p>
        </div>
      </header>

      <div className="planner__grid">
        <aside className="planner__dates md-card">
          <h2>日期</h2>
          <ul className="date-list">
            {dates.map((d) => (
              <li key={d}>
                <button
                  type="button"
                  className={d === selectedDate ? 'date-list__btn is-active' : 'date-list__btn'}
                  onClick={() => selectDate(d)}
                >
                  {d}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <main className="planner__timeline">
          <div className="planner__day-title">
            <h2>{selectedDate}</h2>
          </div>
          <Timeline
            items={items ?? []}
            loading={itemsLoading}
            onDelete={handleDelete}
            onFocusPlace={handleFocusPlace}
            deletingId={deletingId}
          />
          <ItemForm
            tripStart={trip.start_date}
            tripEnd={trip.end_date}
            selectedDate={selectedDate}
            places={places ?? []}
            pendingPlaceId={pendingPlaceId}
            titlePlaceholder={
              cityHints?.title_placeholder ?? `例如：${trip.city_name}热门景点`
            }
            onSubmit={handleCreate}
            submitting={createItem.isPending}
          />
        </main>

        <aside className="planner__map md-card">
          <h2>地图与地点</h2>
          <AmapMap
            center={mapCenter}
            markers={places ?? []}
            focus={mapFocus}
            polyline={polyline}
          />
          <RoutePreviewPanel
            tripId={tripId}
            date={selectedDate}
            afterItemId={afterItemId}
            beforeItemId={beforeItemId}
            onPolylineChange={onPolylineChange}
            onPersisted={() => setPolyline([])}
          />
          <PlaceSearch
            tripId={tripId}
            cityName={trip.city_name}
            searchPlaceholder={
              cityHints?.search_placeholder ?? `例如：${trip.city_name}地标 / 博物馆`
            }
            onPlaceSaved={handlePlaceSaved}
          />
        </aside>
      </div>
    </div>
  );
}
