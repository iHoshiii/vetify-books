import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, write } from './api';

type Account = { user: { id: string; name?: string; role: 'user' | 'professional' | 'admin' };
  professional?: { status: string }; csrf: string; mainOrigin: string; screeningSchedule?: 'daily' | 'continuous' };
const Context = createContext<{ account?: Account; loading: boolean; error?: string; logout: () => Promise<void> } | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['session'], queryFn: () => api<Account>('/auth/me'), retry: false,
    refetchInterval: 30000, refetchOnWindowFocus: true });
  async function logout() {
    if (!query.data) return;
    await write('/auth/logout', query.data.csrf);
    client.clear();
    window.location.assign('/');
  }
  const error = query.error instanceof ApiError && query.error.status === 401 ? undefined : query.error?.message;
  return <Context.Provider value={{ account: query.error ? undefined : query.data, loading: query.isPending, error, logout }}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
