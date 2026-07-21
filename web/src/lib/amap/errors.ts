/** AMap JS API related error codes for UI degradation. */

export class AmapConfigError extends Error {
  readonly code: 'MISSING_JS_KEY' | 'MISSING_SECURITY_CODE' | 'AMAP_LOAD_FAILED';

  constructor(code: AmapConfigError['code'], message: string) {
    super(message);
    this.name = 'AmapConfigError';
    this.code = code;
  }
}

export function isAmapConfigError(err: unknown): err is AmapConfigError {
  return err instanceof AmapConfigError;
}
