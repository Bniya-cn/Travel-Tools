/**
 * Load AMap JS API 2.0.
 * Sets security config before load. Does not create Map/Marker/Polyline.
 */
import AMapLoader from '@amap/amap-jsapi-loader';
import { AmapConfigError } from './errors';
import type { AMapNamespace } from './types';

let loadPromise: Promise<AMapNamespace> | null = null;

function readJsKey(): string {
  const key = import.meta.env.VITE_AMAP_JS_KEY as string | undefined;
  if (!key?.trim()) {
    throw new AmapConfigError('MISSING_JS_KEY', '未配置 VITE_AMAP_JS_KEY，请在 web/.env.local 填写');
  }
  return key.trim();
}

function readSecurityCode(): string {
  const code = import.meta.env.VITE_AMAP_SECURITY_CODE as string | undefined;
  if (!code?.trim()) {
    throw new AmapConfigError(
      'MISSING_SECURITY_CODE',
      '未配置 VITE_AMAP_SECURITY_CODE，请在 web/.env.local 填写',
    );
  }
  return code.trim();
}

/** Apply securityJsCode before any AMapLoader.load call. */
export function applyAmapSecurityConfig(): void {
  window._AMapSecurityConfig = {
    securityJsCode: readSecurityCode(),
  };
}

/**
 * Idempotent loader — safe under React StrictMode double-invoke.
 */
export function loadAmap(plugins: string[] = []): Promise<AMapNamespace> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const key = readJsKey();
      applyAmapSecurityConfig();
      try {
        const AMap = (await AMapLoader.load({
          key,
          version: '2.0',
          plugins,
        })) as AMapNamespace;
        return AMap;
      } catch (err) {
        loadPromise = null;
        const message = err instanceof Error ? err.message : '高德 JS API 加载失败';
        throw new AmapConfigError('LOAD_FAILED', message);
      }
    })();
  }
  return loadPromise;
}
