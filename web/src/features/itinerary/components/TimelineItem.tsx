import type { ItineraryItem } from '../../../types/trip';
import { categoryLabel, formatTimeLabel } from '../../../utils/dates';

interface Props {
  item: ItineraryItem;
  onDelete: (id: string) => void;
  onFocusPlace?: (item: ItineraryItem) => void;
  deleting?: boolean;
}

export function TimelineItem({ item, onDelete, onFocusPlace, deleting }: Props) {
  const timeText = item.is_all_day
    ? '全天'
    : `${formatTimeLabel(item.start_time)} – ${formatTimeLabel(item.end_time)}`;
  const placeName = item.place?.name;
  const isTransport = item.kind === 'transport';

  return (
    <article className={isTransport ? 'md-card timeline-item timeline-item--transport' : 'md-card timeline-item'}>
      <div className="timeline-item__time">{timeText}</div>
      <div className="timeline-item__body">
        <p className="timeline-item__kind">{isTransport ? '交通' : categoryLabel(item.category)}</p>
        <h3 className="timeline-item__title">{item.title}</h3>
        {item.description && (
          <p className={isTransport ? 'timeline-item__steps' : 'timeline-item__meta'}>
            {item.description}
          </p>
        )}
        {placeName && (
          <button
            type="button"
            className="timeline-item__place"
            onClick={() => onFocusPlace?.(item)}
          >
            地点：{placeName}
          </button>
        )}
      </div>
      <button
        type="button"
        className="md-btn md-btn--text"
        onClick={() => onDelete(item.id)}
        disabled={deleting}
      >
        删除
      </button>
    </article>
  );
}
