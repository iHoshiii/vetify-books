import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus } from 'lucide-react';
import type { BookSummary, BookUploadSummary } from '../../shared/books';
import { api, write } from '../api';
import { useAuth } from '../auth';
import { BookCard } from '../components/book-card';
import { Pagination } from '../components/pagination';
import { UploadForm } from '../components/upload-form';

export default function BooksPage({ manage = false }: { manage?: boolean }) {
  const { account } = useAuth();
  const client = useQueryClient();
  const [view, setView] = useState<'library' | 'uploads'>(manage ? 'uploads' : 'library');
  const [page, setPage] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string>();
  const professional = account?.user.role === 'professional';
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
        setMessage(daily ? 'Queued for the daily veterinary relevance check.' : 'Checking veterinary relevance...');
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
  return <main className="page">
    <header className="page-heading"><div><p className="eyebrow">THE VETERINARY LIBRARY</p><h1>Veterinary Books</h1>
      <p>Knowledge for better animal care.</p></div>
      {canUpload && <button className="button" aria-expanded={showUpload} aria-controls="book-upload" onClick={() => setShowUpload(!showUpload)}><Plus size={17} />Upload book</button>}
    </header>
    {professional && <div className="tabs" role="tablist" aria-label="Book views">{(['library', 'uploads'] as const).map((tab) =>
      <button key={tab} role="tab" aria-selected={view === tab} className={view === tab ? 'selected' : ''}
        onClick={() => { setView(tab); setPage(1); }}>{tab === 'library' ? 'Library' : 'My uploads'}</button>)}</div>}
    {professional && !canUpload && <p className="notice">Verified professional approval is required before you can upload.</p>}
    {daily && canUpload && <p className="notice">New uploads and rechecks are reviewed daily. Documents stay private until approved. Busy queues may take longer.</p>}
    {showUpload && canUpload && account && <UploadForm csrf={account.csrf} onClose={() => setShowUpload(false)} onComplete={() => {
      setShowUpload(false); setView('uploads'); setPage(1);
      setMessage(daily ? 'Uploaded. Queued for the daily veterinary relevance check.' : 'Uploaded. Checking veterinary relevance...');
      void client.invalidateQueries({ queryKey: ['books'] });
    }} />}
    {message && <p className="notice success" role="status">{message}</p>}
    {(error || books.error) && <p className="notice error" role="alert">{error || books.error?.message}</p>}
    {books.isPending && <p className="loading" role="status">Loading documents...</p>}
    {!books.isPending && !books.error && books.data?.items.length === 0 && <div className="empty-state"><BookOpen size={36} />
      <h2>{view === 'uploads' ? 'Your library starts here' : 'No approved documents yet'}</h2>
      <p>{view === 'uploads' ? 'Share your first veterinary resource for checking.' : 'Approved veterinary resources will appear here.'}</p></div>}
    {books.data && <><div className="collection-label"><span>{view === 'library' ? 'Library collection' : 'Your submissions'}</span><span>{books.data.total} documents</span></div>
      <div className="book-grid">{books.data.items.map((book) => <BookCard key={book.id} book={book} daily={daily} mine={view === 'uploads'} busy={busy === book.id}
        onDownload={() => { void action(book); }} onRecheck={() => { void action(book, true); }} />)}</div>
      <Pagination page={page} pages={books.data.pages} onChange={setPage} /></>}
  </main>;
}
