import { z } from 'zod';

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Database {
  prepare(query: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface Env {
  DB: D1Database;
  CURRENT_USER_ID?: string;
  CURRENT_USER_ACCOUNT?: string;
  AMAP_WEB_SERVICE_KEY?: string;
  AI_API_BASE_URL?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  PREVIEW_TOKEN_SECRET?: string;
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = defaultStatus(code),
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function defaultStatus(code: string): number {
  return ({
    VALIDATION_ERROR: 422,
    AUTH_REQUIRED: 401,
    INVALID_CREDENTIALS: 401,
    NOT_FOUND: 404,
    CONFLICT: 409,
    ACCOUNT_EXISTS: 409,
    ITEM_TIME_CONFLICT: 409,
    TRIP_DATE_RANGE_HAS_ITEMS: 409,
    PLACE_IN_USE: 409,
    PLACE_TRIP_MISMATCH: 422,
    PREVIEW_TOKEN_INVALID: 422,
    AMAP_SERVICE_ERROR: 502,
  } as Record<string, number>)[code] ?? 500;
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data, error: null }, { status });
}

export function health(data: Record<string, unknown>): Response {
  return Response.json(data, { status: 200 });
}

export function apiError(error: unknown): Response {
  const appError = error instanceof AppError
    ? error
    : error instanceof z.ZodError
      ? new AppError('VALIDATION_ERROR', '请求参数无效', 422, { issues: error.issues })
      : new AppError('INTERNAL_ERROR', '服务器内部错误', 500);
  return Response.json(
    { data: null, error: { code: appError.code, message: appError.message, details: appError.details } },
    { status: appError.status },
  );
}

export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    throw new AppError('VALIDATION_ERROR', '请求体必须为 JSON', 422);
  }
  return schema.parse(payload);
}

export function stringParam(value: string | null, name: string): string {
  const text = value?.trim();
  if (!text) throw new AppError('VALIDATION_ERROR', `${name}不能为空`, 422);
  return text;
}

export function now(): string {
  return new Date().toISOString();
}

export function id(): string {
  return crypto.randomUUID();
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function toNumber(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export async function digest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

export async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((item) => item.toString(16).padStart(2, '0')).join('');
}
