import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '../auth';
import { api, ApiError } from '../api';
import { beginMainSignIn } from '../auth-navigation';
import App from '../app';

vi.mock('../api', () => ({ api: vi.fn(), write: vi.fn(), ApiError: class extends Error {
  constructor(public status: number, message: string) { super(message); }
} }));
vi.mock('../auth-navigation', () => ({ beginMainSignIn: vi.fn() }));
beforeEach(() => { vi.mocked(api).mockReset(); vi.mocked(beginMainSignIn).mockReset(); });
afterEach(cleanup);
function Session() {
  const { account, loading, error } = useAuth();
  return <p>{loading ? 'Checking session' : error ?? account?.user.name ?? 'Signed out'}</p>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><AuthProvider><Session /></AuthProvider></QueryClientProvider>);
}
it('starts the main handoff automatically when no Books session exists', async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(401, 'Sign in'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  await waitFor(() => expect(beginMainSignIn).toHaveBeenCalledOnce());
  expect(screen.queryByText('Sign in with Vetify')).not.toBeInTheDocument();
  expect(screen.queryByText(/A library for/)).not.toBeInTheDocument();
});
it('uses an existing Books session without starting another handoff', async () => {
  vi.mocked(api).mockResolvedValue({ user: { id: 'main-id', name: 'Dr. Rivera', role: 'professional' }, csrf: 'csrf' });
  mount();
  expect(await screen.findByText('Dr. Rivera')).toBeInTheDocument();
  expect(beginMainSignIn).not.toHaveBeenCalled();
});
it('shows availability errors without redirecting repeatedly', async () => {
  vi.mocked(api).mockRejectedValue(new ApiError(503, 'Main unavailable'));
  mount();
  expect(await screen.findByText('Main unavailable')).toBeInTheDocument();
  expect(beginMainSignIn).not.toHaveBeenCalled();
});
