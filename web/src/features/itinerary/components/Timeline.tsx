import type { ItineraryItem } from '../../../types/trip';
import { TimelineItem } from './TimelineItem';

interface Props {
  items: ItineraryItem[];
  loading?: boolean;
  onDelete: (id: string) => void;
  onFocusPlace?: (item: ItineraryItem) => void;
  deletingId?: string | null;
}

export function Timeline({ items, loading, onDelete, onFocusPlace, deletingId }: Props) {
  if (loading) {
    return <div className="md-empty">加载日程中…</div>;
  }

  const allDay = items.filter((i) => i.is_all_day);
  const timed = items.filter((i) => !i.is_all_day);

  if (items.length === 0) {
    return (
      <div className="md-empty">
        <p>这一天还没有已保存行程</p>
        <p className="md-muted">在上方排好顺序并「生成路线」后，点「保存行程」即可写入这里</p>
      </div>
    );
  }

  return (
    <div className="timeline">
      {allDay.length > 0 && (
        <section className="timeline__section">
          <h3 className="timeline__section-title">全天</h3>
          <div className="timeline__list">
            {allDay.map((item) => (
              <TimelineItem
                key={item.id}
                item={item}
                onDelete={onDelete}
                onFocusPlace={onFocusPlace}
                deleting={deletingId === item.id}
              />
            ))}
          </div>
        </section>
      )}
      <section className="timeline__section">
        <h3 className="timeline__section-title">时间轴</h3>
        <div className="timeline__list">
          {timed.map((item) => (
            <TimelineItem
              key={item.id}
              item={item}
              onDelete={onDelete}
              onFocusPlace={onFocusPlace}
              deleting={deletingId === item.id}
            />
          ))}
          {timed.length === 0 && <p className="md-muted">暂无定时事项</p>}
        </div>
      </section>
    </div>
  );
}
