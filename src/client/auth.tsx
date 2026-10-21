import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, write } from './api';
import { beginMainSignIn } from './auth-navigation';

type Account = { user: { id: string; name?: string; role: 'user' | 'professional' | 'admin' };
  professional?: { status: string }; csrf: string; mainOrigin: string; screeningSchedule?: 'daily' | 'continuous' };
const Context = createContext<{ account?: Account; loading: boolean; error?: string; logout: () => Promise<void> } | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['session'], queryFn: () => api<Account>('/auth/me'), retry: false,
    refetchInterval: 30000, refetchOnWindowFocus: true });
  const redirecting = useRef(false);
  const signedOut = query.error instanceof ApiError && query.error.status === 401;
  useEffect(() => {
    if (signedOut && !redirecting.current) {
      redirecting.current = true;
      beginMainSignIn();
    }
  }, [signedOut]);
  async function logout() {
    if (!query.data) return;
    await write('/auth/logout', query.data.csrf);
    client.clear();
    window.location.assign('/');
  }
  const error = signedOut ? undefined : query.error?.message;
  return <Context.Provider value={{ account: query.error ? undefined : query.data, loading: query.isPending || signedOut, error, logout }}>{children}</Context.Provider>;
}
export function useAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is required.');
  return value;
}
