import { useEffect, useState } from 'react';
import { useCreatePlace, usePlaceSearch } from '../../../hooks/usePlaces';
import { ApiClientError } from '../../../types/api';
import type { Place, PlaceSearchResult } from '../../../types/place';

interface Props {
  tripId: string;
  cityName: string;
  /** 城市推荐地点（已含真实地址），进入页面即可点击添加 */
  recommendedPlaces?: PlaceSearchResult[];
  recommendationsLoading?: boolean;
  onPlaceSaved: (place: Place) => void;
}

export function PlaceSearch({
  tripId,
  cityName,
  recommendedPlaces = [],
  recommendationsLoading = false,
  onPlaceSaved,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [debounced, setDebounced] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const createPlace = useCreatePlace(tripId);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(keyword.trim()), 450);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const search = usePlaceSearch(debounced, cityName, debounced.length > 0);

  async function handleSelect(hit: PlaceSearchResult) {
    setSaveError(null);
    try {
      const place = await createPlace.mutateAsync({
        name: hit.name,
        amap_poi_id: hit.amap_poi_id,
        address: hit.address,
        city_name: hit.city_name ?? cityName,
        district: hit.district,
        lng: hit.lng,
        lat: hit.lat,
      });
      onPlaceSaved(place);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : '保存地点失败');
    }
  }

  const showSearchResults = debounced.length > 0;

  return (
    <div className="place-search">
      <label className="md-field">
        <span>搜索地点</span>
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入地点名称搜索"
        />
      </label>

      {!cityName && <div className="md-banner md-banner--error">当前旅行缺少城市名称，无法搜索</div>}
      {saveError && <div className="md-banner md-banner--error">{saveError}</div>}

      {!showSearchResults && (
        <div className="recommend-block">
          <span className="recommend-block__label">推荐地点</span>
          {recommendationsLoading && <p className="md-muted">加载推荐…</p>}
          {!recommendationsLoading && recommendedPlaces.length === 0 && (
            <p className="md-muted">暂无推荐地点</p>
          )}
          <ul className="place-search__list">
            {recommendedPlaces.map((hit) => (
              <li key={`rec-${hit.amap_poi_id ?? hit.name}-${hit.lng}-${hit.lat}`}>
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
      )}

      {showSearchResults && (
        <>
          {search.isError && (
            <div className="md-banner md-banner--error">
              {search.error instanceof ApiClientError ? search.error.message : '搜索失败'}
            </div>
          )}
          {search.isFetching && <p className="md-muted">搜索中…</p>}
          {!search.isFetching && search.data && search.data.length === 0 && (
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
        </>
      )}
    </div>
  );
}
