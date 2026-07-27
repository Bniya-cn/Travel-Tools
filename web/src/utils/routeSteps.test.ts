import { describe, expect, it } from 'vitest';
import { simplifyRouteSteps } from './routeSteps';
import type { RouteStep } from '../types/route';

describe('simplifyRouteSteps', () => {
  it('merges consecutive walking micro-steps', () => {
    const steps: RouteStep[] = [
      { instruction: '步行43米右转', distance_meters: 43, duration_seconds: 30, mode: 'walking' },
      { instruction: '步行114米左转', distance_meters: 114, duration_seconds: 90, mode: 'walking' },
      {
        instruction: '地铁1号线 · 陈家祠上车 → 体育西路下车 · 共 4 站',
        distance_meters: 3000,
        duration_seconds: 600,
        mode: 'transit',
        departure_stop: '陈家祠',
        arrival_stop: '体育西路',
        via_num: 3,
      },
      { instruction: '步行78米到达', distance_meters: 78, duration_seconds: 60, mode: 'walking' },
    ];
    const simplified = simplifyRouteSteps(steps);
    expect(simplified).toHaveLength(3);
    expect(simplified[0].instruction).toBe('步行约 157 米');
    expect(simplified[1].mode).toBe('transit');
    expect(simplified[1].departure_stop).toBe('陈家祠');
    expect(simplified[2].instruction).toBe('步行约 78 米');
  });
});
