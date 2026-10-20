import { state } from './books-fixtures';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { it, expect, vi } from 'vitest';
import { api } from '../api';
import AffiliatePage from '../pages/affiliate-page';

vi.mock('../components/affiliate-charts', () => ({ AffiliateCharts: () => <div>Activity charts</div> }));
it('shows actual tracked earnings, credited downloads and document breakdown', async () => {
  state.role = 'professional';
  vi.mocked(api).mockResolvedValue({ earningsCentavos: 600, monthEarningsCentavos: 400, downloads: 3, rateCentavos: 200,
    daily: [], topBooks: [], items: [{ id: 'book', title: 'Veterinary article', downloads: 3, earningsCentavos: 600 }], page: 1, pages: 1 });
  render(<QueryClientProvider client={new QueryClient()}><AffiliatePage /></QueryClientProvider>);
  expect(await screen.findByText('Veterinary article')).toBeInTheDocument();
  expect(screen.getAllByText('₱6.00')).toHaveLength(2);
  expect(screen.getByText('₱4.00')).toBeInTheDocument();
  expect(screen.getByText(/Payments and withdrawals are not available/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument();
});
