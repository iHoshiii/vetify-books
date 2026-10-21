import type { BookSummary, BookUploadSummary } from '../../shared/books';
import { ReviewStatus } from './review-status';

export function BookCard({ book, mine, busy, saving, daily = false, onDownload, onRecheck, onPreview, onSave }: {
  book: BookSummary | BookUploadSummary; mine: boolean; busy: boolean;
  daily?: boolean; onDownload: () => void; onRecheck: () => void;
  saving: boolean; onPreview: () => void; onSave: () => void;
}) {
  const uploaded = 'status' in book ? book : undefined;
  return <article className="book-card">
    <div className="card-top"><span className="topic">{book.topic}</span><span className="file-type">PDF</span></div>
    <h2>{book.title}</h2>
    <p className="description">{book.description}</p>
    <div className="book-meta"><span>{book.uploadedBy}</span><span>PDF · {(book.size / 1048576).toFixed(1)} MB</span></div>
    <div className="card-bottom">
      <time dateTime={book.createdAt}>{new Date(book.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</time>
      {(!mine || uploaded?.status === 'approved') && <div className="card-actions">
        <button className="button secondary small" aria-label={`Preview ${book.title}`} onClick={onPreview}>Preview</button>
        <button className="button small" aria-label={`Download ${book.title}`} disabled={busy} onClick={onDownload}>{busy ? 'Preparing...' : 'Download'}</button>
        <button className="text-button save-button" aria-pressed={!!book.saved} disabled={saving}
          aria-label={`${book.saved ? 'Remove' : 'Save'} ${book.title}${book.saved ? ' from saved books' : ''}`} onClick={onSave}>
          {saving ? 'Saving...' : book.saved ? 'Saved' : 'Save'}</button>
      </div>}
    </div>
    {mine && uploaded && <ReviewStatus book={uploaded} daily={daily} />}
    {mine && uploaded && ['unverified', 'rejected'].includes(uploaded.status) &&
      <button className="button secondary small recheck" disabled={busy} onClick={onRecheck}>Check again</button>}
  </article>;
}
