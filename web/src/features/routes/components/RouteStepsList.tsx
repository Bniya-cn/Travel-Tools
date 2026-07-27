import type { RouteStep } from '../../../types/route';
import { simplifyRouteSteps } from '../../../utils/routeSteps';

interface Props {
  steps: RouteStep[];
  compact?: boolean;
}

/** 逐步展示：坐哪条线、哪站上/下；过细步行已合并。 */
export function RouteStepsList({ steps, compact }: Props) {
  const visible = simplifyRouteSteps(steps).filter((s) => (s.instruction || '').trim());
  if (visible.length === 0) {
    return <p className="md-muted route-steps__empty">暂无分步指引</p>;
  }

  return (
    <ol className={compact ? 'route-steps route-steps--compact' : 'route-steps'}>
      {visible.map((step, index) => {
        const isWalk = step.mode === 'walking';
        const stopCount =
          step.via_num != null && step.via_num >= 0 ? step.via_num + 1 : null;
        return (
          <li key={`${step.mode}-${index}-${step.instruction}`} className="route-steps__item">
            <span className={isWalk ? 'route-steps__badge is-walk' : 'route-steps__badge is-transit'}>
              {isWalk ? '步行' : step.line_type?.includes('地铁') ? '地铁' : '公交'}
            </span>
            <div className="route-steps__body">
              <p className="route-steps__text">{step.instruction}</p>
              {!compact && !isWalk && (step.departure_stop || step.arrival_stop) && (
                <p className="route-steps__meta md-muted">
                  {step.departure_stop ? `${step.departure_stop}上车` : ''}
                  {step.departure_stop && step.arrival_stop ? ' → ' : ''}
                  {step.arrival_stop ? `${step.arrival_stop}下车` : ''}
                  {stopCount != null ? ` · 共 ${stopCount} 站` : ''}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
