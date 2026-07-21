import { useEffect, useMemo, useRef, useState } from 'react';
import { CHINA_REGIONS, toAmapCityName, type ProvinceNode } from '../../../data/chinaRegions';

export type CityPickerValue = {
  /** 展示文案，如 陕西省 / 西安市 / 雁塔区 */
  label: string;
  /** 写入后端的城市名（地级市，供高德搜索/公交） */
  cityName: string;
};

interface Props {
  value: CityPickerValue | null;
  onChange: (value: CityPickerValue) => void;
  required?: boolean;
}

type Hit =
  | { kind: 'city'; province: string; city: string }
  | { kind: 'district'; province: string; city: string; district: string };

function buildHits(province: ProvinceNode, q: string): Hit[] {
  const query = q.trim().toLowerCase();
  const hits: Hit[] = [];
  for (const city of province.cities) {
    const cityHit = !query || city.name.toLowerCase().includes(query);
    if (cityHit) {
      hits.push({ kind: 'city', province: province.name, city: city.name });
    }
    if (!query) continue;
    for (const district of city.districts ?? []) {
      if (district.toLowerCase().includes(query) || city.name.toLowerCase().includes(query)) {
        hits.push({
          kind: 'district',
          province: province.name,
          city: city.name,
          district,
        });
      }
    }
  }
  return hits;
}

/** 全国范围搜索（触发框直接输入时） */
function searchAllRegions(q: string): Hit[] {
  const query = q.trim().toLowerCase();
  if (!query) return [];
  const hits: Hit[] = [];
  for (const province of CHINA_REGIONS) {
    for (const city of province.cities) {
      if (city.name.toLowerCase().includes(query) || province.name.toLowerCase().includes(query)) {
        hits.push({ kind: 'city', province: province.name, city: city.name });
      }
      for (const district of city.districts ?? []) {
        if (district.toLowerCase().includes(query)) {
          hits.push({
            kind: 'district',
            province: province.name,
            city: city.name,
            district,
          });
        }
      }
    }
  }
  return hits.slice(0, 80);
}

export function CityPicker({ value, onChange, required }: Props) {
  const [open, setOpen] = useState(false);
  const [provinceName, setProvinceName] = useState(CHINA_REGIONS[0]?.name ?? '');
  const [keyword, setKeyword] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const province = useMemo(
    () => CHINA_REGIONS.find((p) => p.name === provinceName) ?? CHINA_REGIONS[0],
    [provinceName],
  );

  const nationwide = keyword.trim().length > 0;
  const hits = useMemo(() => {
    if (nationwide) return searchAllRegions(keyword);
    return province ? buildHits(province, '') : [];
  }, [province, keyword, nationwide]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setKeyword('');
      }
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function selectHit(hit: Hit) {
    if (hit.kind === 'city') {
      onChange({
        label: `${hit.province} / ${hit.city}`,
        cityName: toAmapCityName(hit.city),
      });
    } else {
      onChange({
        label: `${hit.province} / ${hit.city} / ${hit.district}`,
        cityName: toAmapCityName(hit.city),
      });
      setProvinceName(hit.province);
    }
    setOpen(false);
    setKeyword('');
  }

  return (
    <div className="city-picker" ref={rootRef}>
      <span className="md-field__label">城市（全国）</span>
      <input
        ref={inputRef}
        type="text"
        className="city-picker__trigger"
        role="combobox"
        aria-expanded={open}
        aria-controls="city-picker-panel"
        aria-autocomplete="list"
        placeholder="输入城市 / 区县，或点击选择省份"
        value={open ? keyword : value?.label ?? ''}
        required={required && !value?.cityName}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setKeyword(e.target.value);
          setOpen(true);
        }}
        onClick={() => {
          setOpen(true);
          inputRef.current?.select();
        }}
      />
      <input type="text" value={value?.cityName ?? ''} readOnly hidden tabIndex={-1} aria-hidden />

      {open && (
        <div
          id="city-picker-panel"
          className="city-picker__panel"
          role="dialog"
          aria-label="选择城市"
        >
          <aside className="city-picker__provinces">
            {CHINA_REGIONS.map((p) => (
              <button
                key={p.name}
                type="button"
                className={p.name === provinceName && !nationwide ? 'is-active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setProvinceName(p.name);
                  setKeyword('');
                  inputRef.current?.focus();
                }}
              >
                {p.name}
              </button>
            ))}
          </aside>
          <div className="city-picker__main">
            <p className="city-picker__hint md-muted">
              {nationwide
                ? `全国搜索「${keyword.trim()}」`
                : `当前省份：${province?.name ?? ''}（可在上方输入框搜索）`}
            </p>
            <ul className="city-picker__results">
              {hits.length === 0 && (
                <li className="md-muted">{nationwide ? '无匹配结果' : '请选择城市，或输入关键词搜索'}</li>
              )}
              {hits.map((hit) => {
                const key =
                  hit.kind === 'city'
                    ? `${hit.province}-${hit.city}`
                    : `${hit.province}-${hit.city}-${hit.district}`;
                const text =
                  hit.kind === 'city'
                    ? nationwide
                      ? `${hit.province} · ${hit.city}`
                      : hit.city
                    : nationwide
                      ? `${hit.province} · ${hit.city} · ${hit.district}`
                      : `${hit.city} · ${hit.district}`;
                return (
                  <li key={key}>
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => selectHit(hit)}>
                      {text}
                      <span className="md-muted">{hit.kind === 'city' ? '城市' : '区县'}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
