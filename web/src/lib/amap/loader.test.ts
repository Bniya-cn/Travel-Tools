import { describe, expect, it, vi, beforeEach } from 'vitest';
import { hasAmapJsKeyConfigured, loadAMap } from './loader';
import { AmapConfigError } from './errors';

describe('amap loader', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('reports missing key', () => {
    vi.stubEnv('VITE_AMAP_JS_KEY', '');
    vi.stubEnv('VITE_AMAP_SECURITY_CODE', '');
    expect(hasAmapJsKeyConfigured()).toBe(false);
  });

  it('loadAMap throws when key missing', async () => {
    vi.stubEnv('VITE_AMAP_JS_KEY', '');
    vi.stubEnv('VITE_AMAP_SECURITY_CODE', 'sec');
    await expect(loadAMap()).rejects.toBeInstanceOf(AmapConfigError);
    await expect(loadAMap()).rejects.toMatchObject({ code: 'MISSING_JS_KEY' });
  });
});
