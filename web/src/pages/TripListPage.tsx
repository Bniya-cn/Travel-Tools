import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useCreateTrip, useDeleteTrip, useTrips } from '../hooks/useTrips';
import { ApiClientError } from '../types/api';

export function TripListPage() {
  const { data: trips, isLoading, error } = useTrips();
  const createTrip = useCreateTrip();
  const deleteTrip = useDeleteTrip();

  const [name, setName] = useState('西安五日游');
  const [cityName, setCityName] = useState('西安');
  const [cityCode, setCityCode] = useState('029');
  const [startDate, setStartDate] = useState('2026-10-01');
  const [endDate, setEndDate] = useState('2026-10-05');
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (endDate < startDate) {
      setFormError('结束日期不能早于开始日期');
      return;
    }
    try {
      await createTrip.mutateAsync({
        name,
        city_name: cityName,
        city_code: cityCode || null,
        start_date: startDate,
        end_date: endDate,
        timezone: 'Asia/Shanghai',
      });
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : '创建失败');
    }
  }

  return (
    <div className="app-shell">
      <header className="app-bar">
        <div>
          <p className="app-bar__eyebrow">Travel Planner</p>
          <h1>我的旅行</h1>
        </div>
      </header>

      <div className="content-grid">
        <section className="md-card">
          <h2>新建旅行</h2>
          {formError && <div className="md-banner md-banner--error">{formError}</div>}
          <form className="stack-form" onSubmit={handleCreate}>
            <label className="md-field">
              <span>名称</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="md-field">
              <span>城市</span>
              <input value={cityName} onChange={(e) => setCityName(e.target.value)} required />
            </label>
            <label className="md-field">
              <span>城市代码</span>
              <input value={cityCode} onChange={(e) => setCityCode(e.target.value)} placeholder="029" />
            </label>
            <div className="item-form__times">
              <label className="md-field">
                <span>开始</span>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </label>
              <label className="md-field">
                <span>结束</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              </label>
            </div>
            <button type="submit" className="md-btn md-btn--primary" disabled={createTrip.isPending}>
              {createTrip.isPending ? '创建中…' : '创建旅行'}
            </button>
          </form>
        </section>

        <section>
          <h2 className="section-heading">旅行列表</h2>
          {isLoading && <div className="md-empty">加载中…</div>}
          {error && <div className="md-banner md-banner--error">无法加载旅行列表</div>}
          {!isLoading && trips && trips.length === 0 && (
            <div className="md-empty">还没有旅行，先创建一个吧</div>
          )}
          <div className="trip-list">
            {trips?.map((trip) => (
              <article key={trip.id} className="md-card trip-card">
                <div>
                  <h3>{trip.name}</h3>
                  <p className="md-muted">
                    {trip.city_name} · {trip.start_date} ~ {trip.end_date}
                  </p>
                  <p className="md-muted">事项 {trip.items_count ?? 0} 项</p>
                </div>
                <div className="trip-card__actions">
                  <Link className="md-btn md-btn--primary" to={`/trips/${trip.id}`}>
                    进入规划
                  </Link>
                  <button
                    type="button"
                    className="md-btn md-btn--text"
                    onClick={() => deleteTrip.mutate(trip.id)}
                    disabled={deleteTrip.isPending}
                  >
                    删除
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
