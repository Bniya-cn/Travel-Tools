import { createContext } from 'react';
import type { AuthInput, AuthUser } from '../types/auth';

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (payload: Pick<AuthInput, 'account' | 'password'>) => Promise<AuthUser>;
  register: (payload: AuthInput) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
