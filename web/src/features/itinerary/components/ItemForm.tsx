import { useEffect, useState, type FormEvent } from 'react';
import type { ItemCategory, ItemCreateInput } from '../../../types/trip';
import type { Place } from '../../../types/place';
import { ConflictWarning } from './ConflictWarning';
import { ApiClientError } from '../../../types/api';

interface Props {
  tripStart: string;
  tripEnd: string;
  selectedDate: string;
  places: Place[];
  pendingPlaceId?: string | null;
  /** 城市推荐事项标题，点击填入标题框 */
  recommendedTitles?: string[];
  onSubmit: (payload: ItemCreateInput) => Promise<void>;
  submitting?: boolean;
}

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: 'place', label: '景点' },
  { value: 'meal', label: '餐饮' },
  { value: 'hotel', label: '住宿' },
  { value: 'rest', label: '休息' },
  { value: 'custom', label: '自定义' },
];

export function ItemForm({
  tripStart,
  tripEnd,
  selectedDate,
  places,
  pendingPlaceId,
  recommendedTitles = [],
  onSubmit,
  submitting,
}: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [category, setCategory] = useState<ItemCategory>('place');
  const [isAllDay, setIsAllDay] = useState(false);
  const [placeId, setPlaceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDate(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (pendingPlaceId) {
      setPlaceId(pendingPlaceId);
      const place = places.find((p) => p.id === pendingPlaceId);
      if (place && !title.trim()) {
        setTitle(place.name);
      }
    }
  }, [pendingPlaceId, places, title]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('请填写标题');
      return;
    }
    if (date < tripStart || date > tripEnd) {
      setError('日期必须在旅行范围内');
      return;
    }
    if (!isAllDay) {
      if (!startTime || !endTime) {
        setError('请填写开始和结束时间');
        return;
      }
      if (endTime <= startTime) {
        setError('结束时间必须晚于开始时间（不允许跨午夜）');
        return;
      }
    }

    const payload: ItemCreateInput = {
      title: title.trim(),
      date,
      is_all_day: isAllDay,
      kind: 'activity',
      category,
      start_time: isAllDay ? null : startTime,
      end_time: isAllDay ? null : endTime,
      place_id: placeId || null,
    };

    try {
      await onSubmit(payload);
      setTitle('');
      setIsAllDay(false);
      setPlaceId('');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('保存失败');
      }
    }
  }

  return (
    <form className="md-card item-form" onSubmit={handleSubmit}>
      <h3 className="item-form__title">添加事项</h3>
      {error && <ConflictWarning message={error} />}

      {recommendedTitles.length > 0 && (
        <div className="recommend-block">
          <span className="recommend-block__label">推荐标题</span>
          <div className="recommend-block__chips">
            {recommendedTitles.map((t) => (
              <button
                key={t}
                type="button"
                className="recommend-chip"
                onClick={() => setTitle(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="md-field">
        <span>标题</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="输入事项标题"
        />
      </label>

      <label className="md-field">
        <span>关联地点（可选）</span>
        <select value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
          <option value="">不关联地点</option>
          {places.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="md-field">
        <span>日期</span>
        <input type="date" value={date} min={tripStart} max={tripEnd} onChange={(e) => setDate(e.target.value)} />
      </label>

      <label className="md-field md-field--row">
        <input type="checkbox" checked={isAllDay} onChange={(e) => setIsAllDay(e.target.checked)} />
        <span>全天事项</span>
      </label>

      {!isAllDay && (
        <div className="item-form__times">
          <label className="md-field">
            <span>开始</span>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </label>
          <label className="md-field">
            <span>结束</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
      )}

      <label className="md-field">
        <span>分类</span>
        <select value={category} onChange={(e) => setCategory(e.target.value as ItemCategory)}>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" className="md-btn md-btn--primary" disabled={submitting}>
        {submitting ? '保存中…' : '添加到日程'}
      </button>
    </form>
  );
}
