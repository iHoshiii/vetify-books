import { book, mount } from './books-fixtures';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, write } from '../api';

vi.mock('../components/use-pdf', () => ({ usePdf: () => ({ pages: 3, loading: false, error: '' }) }));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value() { this.open = true; } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value() { this.open = false; } });
});
afterEach(() => {
  cleanup();
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
  delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
it('submits title search and combines exact topic and saved filters on the server', async () => {
  mount(); await screen.findByText(book.title);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'care' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/books?page=1&q=care'));
  fireEvent.change(screen.getByLabelText('Filter by topic'), { target: { value: 'Surgery' } });
  await waitFor(() => expect(api).toHaveBeenCalledWith('/books?page=1&q=care&topic=Surgery'));
  fireEvent.click(screen.getByRole('button', { name: 'Saved books' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith('/books?page=1&q=care&topic=Surgery&saved=true'));
  fireEvent.click(screen.getByRole('button', { name: 'Clear', exact: true }));
  expect(screen.getByRole('searchbox')).toHaveValue('');
  expect(screen.getByLabelText('Filter by topic')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'Saved books' })).toHaveAttribute('aria-pressed', 'false');
});
it('saves a book and removes it from the saved view when unsaved', async () => {
  let saved = false;
  vi.mocked(api).mockImplementation(async path => ({ items: path.includes('saved=true') && !saved ? [] : [{ ...book, saved }], total: saved ? 1 : 0, pages: 1 }));
  vi.mocked(write).mockImplementation(async (_path, _csrf, body) => { saved = (body as { saved: boolean }).saved; return { saved }; });
  mount(); fireEvent.click(await screen.findByRole('button', { name: `Save ${book.title}` }));
  expect(await screen.findByRole('button', { name: `Remove ${book.title} from saved books` })).toHaveAttribute('aria-pressed', 'true');
  expect(write).toHaveBeenCalledWith(`/books/${book.id}/save`, 'test-csrf', { saved: true });
  fireEvent.click(screen.getByRole('button', { name: 'Saved books' }));
  fireEvent.click(await screen.findByRole('button', { name: `Remove ${book.title} from saved books` }));
  expect(await screen.findByRole('heading', { name: 'No saved books yet' })).toBeInTheDocument();
});
it('keeps save failures visible and leaves the save button available for retry', async () => {
  vi.mocked(write).mockRejectedValue(new Error('Save failed. Try again.'));
  mount(); fireEvent.click(await screen.findByRole('button', { name: `Save ${book.title}` }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed. Try again.');
  expect(screen.getByRole('button', { name: `Save ${book.title}` })).toBeEnabled();
});
it('previews and pages through a book without requesting a download', async () => {
  vi.mocked(write).mockResolvedValue({ url: 'https://storage.invalid/preview' });
  mount(); fireEvent.click(await screen.findByRole('button', { name: `Preview ${book.title}` }));
  const dialog = await screen.findByRole('dialog', { name: book.title });
  expect(write).toHaveBeenCalledWith(`/books/${book.id}/preview`, 'test-csrf');
  expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Next', exact: true }));
  expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in', exact: true }));
  expect(within(dialog).getByText('125%')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom out', exact: true }));
  expect(within(dialog).getByText('100%')).toBeInTheDocument();
  expect(vi.mocked(write).mock.calls.every(([path]) => !path.endsWith('/download'))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Close', exact: true }));
  expect(dialog).not.toBeInTheDocument();
});
it('shows download failures inside the open preview and leaves retry available', async () => {
  vi.mocked(write).mockImplementation(async path => {
    if (path.endsWith('/preview')) return { url: 'https://storage.invalid/preview' };
    throw new Error('Download failed. Try again.');
  });
  mount(); fireEvent.click(await screen.findByRole('button', { name: `Preview ${book.title}` }));
  const dialog = await screen.findByRole('dialog', { name: book.title });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Download', exact: true }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Download failed. Try again.');
  expect(within(dialog).getByRole('button', { name: 'Download', exact: true })).toBeEnabled();
});
