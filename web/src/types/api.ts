/** Unified API envelope (mirrors server schemas/common.py). */

export interface ApiErrorBody {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiErrorBody | null;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly status?: number;

  constructor(code: string, message: string, details: Record<string, unknown> = {}, status?: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.details = details;
    this.status = status;
  }
}
