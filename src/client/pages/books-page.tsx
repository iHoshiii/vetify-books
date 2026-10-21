import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { BookSummary, BookUploadSummary } from '../../shared/books';
import { api, write } from '../api';
import { useAuth } from '../auth';
import { BookCard } from '../components/book-card';
import { Pagination } from '../components/pagination';
import { UploadForm } from '../components/upload-form';
import { LoadingScreen } from '../components/loading-screen';

export default function BooksPage({ manage = false, onUploaded }: { manage?: boolean; onUploaded?: () => void }) {
  const { account } = useAuth();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>();
  const professional = account?.user.role === 'professional';
  const view = manage && professional ? 'uploads' : 'library';
  const canUpload = professional && account?.professional?.status === 'verified';
  const daily = account?.screeningSchedule === 'daily';
  const books = useQuery({
    queryKey: ['books', account?.user.id, view, page],
    queryFn: () => api<{ items: (BookSummary | BookUploadSummary)[]; pages: number; total: number }>(`/books${view === 'uploads' ? '/mine' : ''}?page=${page}`),
    enabled: !!account, retry: false,
    refetchInterval: (query) => view === 'uploads' && query.state.data?.items.some((book) =>
      'status' in book && ['pending', 'checking'].includes(book.status)) && !daily ? 10000 : 60000,
  });
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
      setShowUpload(false); setPage(1); onUploaded?.();
      setMessage('Uploaded. Your book is waiting for review.');
      void client.invalidateQueries({ queryKey: ['books'] });
    }} />}
    {message && <p className="notice success" role="status">{message}</p>}
    {(error || books.error) && <p className="notice error" role="alert">{error || books.error?.message}</p>}
    {books.isPending && <LoadingScreen />}
    {books.data && <><div className="collection-label"><span>{books.data.total} {books.data.total === 1 ? 'book' : 'books'}</span>
      {view === 'uploads' && <span>{daily ? 'Reviewed daily. ' : ''}Private until approved.</span>}</div>
      {books.data.items.length === 0 && <section className="empty-state"><h2>{view === 'uploads' ? 'No uploads yet' : 'No books yet'}</h2>
        <p>{view === 'uploads' ? 'Upload a book to get started.' : 'New books will appear here.'}</p></section>}
      <div className="book-grid">{books.data.items.map((book) => <BookCard key={book.id} book={book} daily={daily} mine={view === 'uploads'} busy={busy === book.id}
        onDownload={() => { void action(book); }} onRecheck={() => { void action(book, true); }} />)}</div>
      <Pagination page={page} pages={books.data.pages} onChange={setPage} /></>}
  </main>;
}
