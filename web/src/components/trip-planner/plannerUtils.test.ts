import { describe, expect, it } from 'vitest';
import { formatPlannerError, getPlacePresentation } from './plannerUtils';

describe('getPlacePresentation', () => {
  it('classifies common travel locations for display only', () => {
    expect(getPlacePresentation({ name: '陕西历史博物馆', address: null }).kind).toBe('museum');
    expect(getPlacePresentation({ name: '西安咸阳国际机场', address: null }).kind).toBe('transport');
    expect(getPlacePresentation({ name: '回民街', address: null }).kind).toBe('attraction');
  });
});

describe('formatPlannerError', () => {
  it('does not expose raw server errors', () => {
    expect(formatPlannerError('生成路线', { status: 500 })).toBe('路线暂时生成失败，请稍后重试');
  });
});
