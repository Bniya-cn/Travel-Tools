import axios, { AxiosError, type AxiosInstance } from 'axios';
import { ApiClientError, type ApiResponse } from '../types/api';

const configuredBaseURL = import.meta.env.VITE_API_BASE_URL?.trim();
const pointsToLocalServer = configuredBaseURL
  ? /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(configuredBaseURL)
  : false;

// 生产环境使用同域 Pages Functions，避免本机 .env.local 中的开发地址进入部署产物。
const baseURL = import.meta.env.PROD
  ? (pointsToLocalServer ? '' : (configuredBaseURL ?? ''))
  : (configuredBaseURL ?? 'http://localhost:8000');

export const http: AxiosInstance = axios.create({
  baseURL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
});

/**
 * GET JSON wrapped in ApiResponse envelope.
 * Non-envelope endpoints (health, downloads) should use `http` directly.
 */
export async function apiGet<T>(url: string): Promise<T> {
  try {
    const { data, status } = await http.get<ApiResponse<T>>(url);
    return unwrap(data, status);
  } catch (err) {
    throw toClientError(err);
  }
}

export async function apiSend<T>(
  method: 'post' | 'put' | 'patch' | 'delete',
  url: string,
  body?: unknown,
): Promise<T> {
  try {
    const { data, status } = await http.request<ApiResponse<T>>({
      method,
      url,
      data: body,
    });
    return unwrap(data, status);
  } catch (err) {
    throw toClientError(err);
  }
}

function unwrap<T>(payload: ApiResponse<T>, status: number): T {
  if (payload.error) {
    throw new ApiClientError(
      payload.error.code,
      payload.error.message,
      payload.error.details ?? {},
      status,
    );
  }
  return payload.data as T;
}

function toClientError(err: unknown): ApiClientError {
  if (err instanceof ApiClientError) {
    return err;
  }
  if (axios.isAxiosError(err)) {
    const ax = err as AxiosError<ApiResponse<unknown>>;
    const body = ax.response?.data;
    if (body?.error) {
      return new ApiClientError(
        body.error.code,
        body.error.message,
        body.error.details ?? {},
        ax.response?.status,
      );
    }
    if (ax.code === 'ERR_NETWORK') {
      return new ApiClientError('NETWORK_ERROR', '无法连接后端服务，请确认后端已启动');
    }
    return new ApiClientError(
      'HTTP_ERROR',
      ax.message || '请求失败',
      {},
      ax.response?.status,
    );
  }
  return new ApiClientError('UNKNOWN_ERROR', '未知错误');
}

/** Plain health check (not ApiResponse envelope). */
export async function fetchHealth(): Promise<{ status: string }> {
  const { data } = await http.get<{ status: string }>('/health');
  return data;
}
