import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookSummary, BookUploadSummary } from '../../shared/books';
import { api, write } from '../api';
import { useAuth } from '../auth';
import { BookCard } from '../components/book-card';
import { Pagination } from '../components/pagination';
import { UploadForm } from '../components/upload-form';
import { LoadingScreen } from '../components/loading-screen';
import { LibraryFilters, type LibraryFiltersValue } from '../components/library-filters';

const PdfPreview = lazy(() => import('../components/pdf-preview'));

export default function BooksPage({ manage = false, onUploaded }: { manage?: boolean; onUploaded?: () => void }) {
  const { account } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>();
  const [saving, setSaving] = useState<string>();
  const [preview, setPreview] = useState<BookSummary>();
  const [filters, setFilters] = useState<LibraryFiltersValue>({ q: '', topic: '', saved: false });
  const professional = account?.user.role === 'professional';
  const view = manage && professional ? 'uploads' : 'library';
  const canUpload = professional && account?.professional?.status === 'verified';
  const daily = account?.screeningSchedule === 'daily';
  const params = new URLSearchParams({ page: String(page) });
  if (filters.q) params.set('q', filters.q);
  if (filters.topic) params.set('topic', filters.topic);
  if (filters.saved && view === 'library') params.set('saved', 'true');
  const books = useQuery({
    queryKey: ['books', account?.user.id, view, params.toString()],
    queryFn: () => api<{ items: (BookSummary | BookUploadSummary)[]; pages: number; total: number }>(`/books${view === 'uploads' ? '/mine' : ''}?${params}`),
    enabled: !!account, retry: false,
    refetchInterval: (query) => view === 'uploads' && query.state.data?.items.some((book) =>
      'status' in book && ['pending', 'checking'].includes(book.status)) && !daily ? 10000 : 60000,
  });
  useEffect(() => { if (books.data && page > books.data.pages) setPage(books.data.pages); }, [books.data, page]);
  async function save(book: BookSummary) {
    if (!account) return;
    setSaving(book.id); setError('');
    try {
      await write(`/books/${book.id}/save`, account.csrf, { saved: !book.saved });
      await client.invalidateQueries({ queryKey: ['books'] });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Your book could not be saved.'); }
    finally { setSaving(undefined); }
  }
  async function action(book: BookSummary, recheck = false) {
    if (!account) return;
    setBusy(book.id); setError(''); setMessage('');
    try {
      if (recheck) {
        await write(`/books/${book.id}/recheck`, account.csrf);
        setMessage('Your book is waiting for review.');
      } else {
        const result = await write<{ url: string }>(`/books/${book.id}/download`, account.csrf, undefined,
          { 'Idempotency-Key': crypto.randomUUID() });
        const link = document.createElement('a');
        link.href = result.url; link.rel = 'noreferrer';
        document.body.appendChild(link); link.click(); link.remove();
      }
      await client.invalidateQueries({ queryKey: ['books'] });
      await client.invalidateQueries({ queryKey: ['affiliate'] });
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Request failed.'); }
    finally { setBusy(undefined); }
  }
  return <main className="page library-page">
    <header className="page-heading"><div><h1>{view === 'uploads' ? 'My uploads' : 'Library'}</h1>
      <p>{view === 'uploads' ? 'Your books and their review status.' : 'Books for better animal care.'}</p></div>
      {canUpload && <button className="button" aria-expanded={showUpload} aria-controls="book-upload" onClick={() => setShowUpload(!showUpload)}>Upload book</button>}
    </header>
    {professional && !canUpload && <p className="notice">Your account must be verified before you can upload.</p>}
    {showUpload && canUpload && account && <UploadForm csrf={account.csrf} onClose={() => setShowUpload(false)} onComplete={() => {
      setShowUpload(false); setPage(1); setFilters({ q: '', topic: '', saved: false }); onUploaded?.();
      setMessage('Uploaded. Your book is waiting for review.');
      void client.invalidateQueries({ queryKey: ['books'] });
    }} />}
    <LibraryFilters key={view} value={filters} mine={view === 'uploads'} onChange={value => { setFilters(value); setPage(1); }} />
    {message && <p className="notice success" role="status">{message}</p>}
    {(error || books.error) && <p className="notice error" role="alert">{error || books.error?.message}</p>}
    {books.isPending && <LoadingScreen />}
    {books.data && <><div className="collection-label"><span>{books.data.total} {books.data.total === 1 ? 'book' : 'books'}</span>
      {view === 'uploads' && <span>{daily ? 'Reviewed daily. ' : ''}Private until approved.</span>}</div>
      {books.data.items.length === 0 && <section className="empty-state"><h2>{filters.q || filters.topic ? 'No matching books' :
        filters.saved && view === 'library' ? 'No saved books yet' : view === 'uploads' ? 'No uploads yet' : 'No books yet'}</h2>
        <p>{filters.q || filters.topic ? 'Try another search or clear your filters.' : filters.saved && view === 'library' ? 'Save a book to find it here.' :
          view === 'uploads' ? 'Upload a book to get started.' : 'New books will appear here.'}</p></section>}
      <div className="book-grid">{books.data.items.map((book) => <BookCard key={book.id} book={book} daily={daily} mine={view === 'uploads'} busy={busy === book.id}
        saving={saving === book.id} onSave={() => { void save(book); }} onPreview={() => { setError(''); setPreview(book); }}
        onDownload={() => { void action(book); }} onRecheck={() => { void action(book, true); }} />)}</div>
      <Pagination page={page} pages={books.data.pages} onChange={setPage} /></>}
    {preview && account && <Suspense fallback={<LoadingScreen />}><PdfPreview book={preview} csrf={account.csrf} busy={busy === preview.id} downloadError={error}
      onClose={() => setPreview(undefined)} onDownload={() => { void action(preview); }} /></Suspense>}
  </main>;
}
