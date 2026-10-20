import { book, mount, state } from './books-fixtures';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { api, write } from '../api';

describe('Books private uploads, adapted from main', () => {
  it('shows private status and only permits approved-document downloads', async () => {
    state.role = 'professional';
    vi.mocked(api).mockResolvedValue({ items: [
      { ...book, id: 'pending', title: 'Pending article', status: 'pending' },
      { ...book, id: 'approved', title: 'Approved article', status: 'approved' },
      { ...book, id: 'rejected', title: 'Unrelated article', status: 'rejected', reason: 'Unrelated to veterinary care.' },
      { ...book, id: 'uncertain', title: 'Uncertain scan', status: 'unverified' },
    ], total: 4, pages: 1 });
    mount(true); await screen.findByText('Pending article');
    expect(screen.getByRole('tab', { name: 'My uploads' })).toHaveAttribute('aria-selected', 'true');
    expect(api).toHaveBeenCalledWith('/books/mine?page=1');
    expect(screen.getByText('Checking')).toBeInTheDocument();
    expect(screen.getByText('Not approved')).toBeInTheDocument();
    expect(screen.getByText('Unable to verify')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Pending article' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download Unrelated article' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download Approved article' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: 'Check again' })).toHaveLength(2);
  });
  it('refreshes private status after another automatic check', async () => {
    state.role = 'professional'; let status = 'unverified';
    vi.mocked(api).mockImplementation(async () => ({ items: [{ ...book, status }], pages: 1, total: 1 }));
    vi.mocked(write).mockImplementation(async () => { status = 'pending'; return {}; });
    mount(true); fireEvent.click(await screen.findByRole('button', { name: 'Check again' }));
    await waitFor(() => expect(write).toHaveBeenCalledWith('/books/book-id/recheck', 'test-csrf'));
    expect(await screen.findByText('Checking')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Check again' })).not.toBeInTheDocument();
  });
  it('hashes and sends the PDF directly to storage before queuing screening', async () => {
    state.role = 'professional';
    vi.mocked(api).mockImplementation(async (path) => ({ items: path.includes('/mine') ? [{ ...book, status: 'pending' }] : [], pages: 1, total: 1 }));
    vi.mocked(write).mockImplementation(async (path) => path.endsWith('/uploads')
      ? { book: { id: book.id }, upload: { url: 'https://storage.invalid/upload', method: 'PUT' } } : {});
    const digest = vi.fn(async () => new Uint8Array(32).fill(1).buffer);
    vi.stubGlobal('crypto', { subtle: { digest }, randomUUID: () => 'test-id' });
    const transfer = vi.fn(async () => ({ ok: true })); vi.stubGlobal('fetch', transfer);
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Upload book' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: book.title } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: book.description } });
    const file = new File(['%PDF-1.4\n%%EOF'], 'article.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(16) });
    fireEvent.change(screen.getByLabelText(/PDF document/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('button', { name: 'Upload for checking' }).closest('form')!);
    await waitFor(() => expect(write).toHaveBeenCalledWith('/books/uploads', 'test-csrf', expect.objectContaining({ veterinaryOnly: true, sha256: '01'.repeat(32) })));
    expect(transfer).toHaveBeenCalledWith('https://storage.invalid/upload', expect.objectContaining({ body: expect.any(File), credentials: 'omit' }));
    expect(write).toHaveBeenCalledWith('/books/book-id/complete', 'test-csrf');
    expect(await screen.findByText('Checking')).toBeInTheDocument();
  });
});
