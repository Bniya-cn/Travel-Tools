import { apiGet, apiSend } from './client';
import type { AuthInput, AuthUser } from '../types/auth';

export function getCurrentUser() {
  return apiGet<AuthUser | null>('/api/auth/me');
}

export function login(payload: Pick<AuthInput, 'account' | 'password'>) {
  return apiSend<AuthUser>('post', '/api/auth/login', payload);
}

export function register(payload: AuthInput) {
  return apiSend<AuthUser>('post', '/api/auth/register', payload);
}

export function logout() {
  return apiSend<{ ok: boolean }>('post', '/api/auth/logout');
}
