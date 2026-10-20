import { Download, FileText, RotateCw } from 'lucide-react';
import type { BookSummary, BookUploadSummary, BookStatus } from '../../shared/books';

const labels: Record<BookStatus, string> = {
  pending: 'Checking', checking: 'Checking', approved: 'Approved', rejected: 'Not approved', unverified: 'Unable to verify',
};
export function BookCard({ book, mine, busy, daily = false, onDownload, onRecheck }: {
  book: BookSummary | BookUploadSummary; mine: boolean; busy: boolean;
  daily?: boolean; onDownload: () => void; onRecheck: () => void;
}) {
  const uploaded = 'status' in book ? book : undefined;
  const complete = !('uploadComplete' in book) || book.uploadComplete !== false;
  return <article className="book-card">
    <div className="card-top"><span className="document-icon"><FileText size={23} /></span><span className="topic">{book.topic}</span></div>
    <h2>{book.title}</h2>
    <p className="description">{book.description}</p>
    <div className="book-meta"><span>{book.uploadedBy}</span><span>PDF · {(book.size / 1048576).toFixed(1)} MB</span></div>
    <div className="card-bottom">
      <time dateTime={book.createdAt}>{new Date(book.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
      {mine && uploaded && <span className={`status ${uploaded.status}`}>{!complete ? 'Upload incomplete' : daily && uploaded.status === 'pending' ? 'Awaiting daily check' : labels[uploaded.status]}</span>}
      {(!mine || uploaded?.status === 'approved') && <button className="button small" aria-label={`Download ${book.title}`} disabled={busy} onClick={onDownload}><Download size={15} />{busy ? 'Preparing...' : 'Download'}</button>}
    </div>
    {mine && uploaded?.reason && <p className="review-reason">{uploaded.reason}</p>}
    {mine && uploaded && ['unverified', 'rejected'].includes(uploaded.status) &&
      <button className="button secondary small recheck" disabled={busy} onClick={onRecheck}><RotateCw size={14} />Check again</button>}
  </article>;
}
