import { beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import BooksPage from '../pages/books-page';
import { api, write } from '../api';

const fixtureState = vi.hoisted(() => ({ role: 'user' as 'user' | 'professional' | 'admin', verified: true }));
export const state = fixtureState;
vi.mock('../auth', () => ({ useAuth: () => ({ account: { user: { id: 'main-user', role: fixtureState.role },
  professional: { status: fixtureState.verified ? 'verified' : 'pending' }, csrf: 'test-csrf' } }) }));
vi.mock('../api', () => ({ api: vi.fn(), write: vi.fn() }));
export const book = { id: 'book-id', title: 'Veterinary handbook', description: 'Educational veterinary material for animal care.',
  topic: 'Animal welfare', uploadedBy: 'Dr. Rivera', size: 2048, createdAt: '2026-10-14T00:00:00Z' };
beforeEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  state.role = 'user'; state.verified = true;
  vi.mocked(api).mockReset(); vi.mocked(write).mockReset();
  vi.mocked(api).mockResolvedValue({ items: [book, { ...book, id: 'second', title: 'Veterinary surgery' }], pages: 1, total: 2 });
  vi.mocked(write).mockResolvedValue({ url: 'https://private-storage.invalid/signed-pdf' });
});
export function mount(manage = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><BooksPage manage={manage} /></QueryClientProvider>);
}
