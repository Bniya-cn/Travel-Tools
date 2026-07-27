import type { RouteStep } from '../types/route';

/** 合并过细步行指引，只保留「步行约 N 米」+ 地铁/公交。 */
export function simplifyRouteSteps(steps: RouteStep[]): RouteStep[] {
  const out: RouteStep[] = [];
  let walkDist = 0;
  let walkDur = 0;
  let hasWalk = false;

  const flushWalk = () => {
    if (!hasWalk) return;
    out.push({
      instruction: walkDist > 0 ? `步行约 ${walkDist} 米` : '步行',
      distance_meters: walkDist || null,
      duration_seconds: walkDur || null,
      mode: 'walking',
      line_name: null,
      line_type: null,
      departure_stop: null,
      arrival_stop: null,
      via_num: null,
    });
    walkDist = 0;
    walkDur = 0;
    hasWalk = false;
  };

  for (const step of steps) {
    if (step.mode === 'walking') {
      hasWalk = true;
      walkDist += step.distance_meters || 0;
      walkDur += step.duration_seconds || 0;
      continue;
    }
    flushWalk();
    out.push(step);
  }
  flushWalk();
  return out;
}
