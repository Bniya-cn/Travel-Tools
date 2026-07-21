import { useEffect, useState } from 'react';
import { useCreatePlace, usePlaceSearch } from '../../../hooks/usePlaces';
import { ApiClientError } from '../../../types/api';
import type { Place, PlaceSearchResult } from '../../../types/place';

interface Props {
  tripId: string;
  cityCode: string;
  onPlaceSaved: (place: Place) => void;
}

export function PlaceSearch({ tripId, cityCode, onPlaceSaved }: Props) {
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const createPlace = useCreatePlace(tripId);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const search = usePlaceSearch(debounced, cityCode, debounced.length > 0);

  async function handleSelect(hit: PlaceSearchResult) {
    setSaveError(null);
    try {
      const place = await createPlace.mutateAsync({
        name: hit.name,
        amap_poi_id: hit.amap_poi_id,
        address: hit.address,
        city_name: hit.city_name,
        city_code: hit.city_code ?? cityCode,
        district: hit.district,
        lng: hit.lng,
        lat: hit.lat,
      });
      onPlaceSaved(place);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : '保存地点失败');
    }
  }

  return (
    <div className="place-search">
      <label className="md-field">
        <span>搜索地点</span>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="例如：兵马俑 / 陕西历史博物馆"
        />
      </label>

      {!cityCode && <div className="md-banner md-banner--error">当前旅行缺少城市代码，无法搜索</div>}
      {saveError && <div className="md-banner md-banner--error">{saveError}</div>}
      {search.isError && (
        <div className="md-banner md-banner--error">
          {search.error instanceof ApiClientError ? search.error.message : '搜索失败'}
        </div>
      )}
      {search.isFetching && <p className="md-muted">搜索中…</p>}
      {!search.isFetching && debounced && search.data && search.data.length === 0 && (
        <p className="md-muted">无搜索结果</p>
      )}

      <ul className="place-search__list">
        {search.data?.map((hit) => (
          <li key={`${hit.amap_poi_id ?? hit.name}-${hit.lng}-${hit.lat}`}>
            <button
              type="button"
              className="place-search__item"
              onClick={() => handleSelect(hit)}
              disabled={createPlace.isPending}
            >
              <strong>{hit.name}</strong>
              <span className="md-muted">{hit.address || hit.district || '无地址'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
