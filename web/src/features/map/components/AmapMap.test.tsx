import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AmapMap } from './AmapMap';

vi.mock('../../../lib/amap/loader', () => ({
  hasAmapJsKeyConfigured: () => false,
  loadAMap: vi.fn(),
}));

describe('AmapMap', () => {
  it('degrades when JS key is missing', () => {
    render(
      <AmapMap
        center={{ lng: 108.9, lat: 34.2 }}
        markers={[]}
        focus={null}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/未配置高德/);
  });
});
