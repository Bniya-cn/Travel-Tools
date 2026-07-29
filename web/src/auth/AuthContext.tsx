import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getCurrentUser, login, logout, register } from '../api/auth';
import type { AuthUser } from '../types/auth';
import { AuthContext, type AuthContextValue } from './authState';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userOverride, setUserOverride] = useState<AuthUser | null | undefined>(undefined);
  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getCurrentUser,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      setUserOverride(user);
      queryClient.setQueryData(['auth', 'me'], user);
    },
  });
  const registerMutation = useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      setUserOverride(user);
      queryClient.setQueryData(['auth', 'me'], user);
    },
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setUserOverride(null);
      queryClient.clear();
    },
  });

  const value = useMemo<AuthContextValue>(() => ({
    user: userOverride !== undefined ? userOverride : (me.data ?? null),
    isLoading: me.isLoading,
    login: (payload) => loginMutation.mutateAsync(payload),
    register: (payload) => registerMutation.mutateAsync(payload),
    logout: async () => { await logoutMutation.mutateAsync(); },
  }), [loginMutation, logoutMutation, me.data, me.isLoading, registerMutation, userOverride]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
