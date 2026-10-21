import type { BookStatus, BookUploadSummary } from '../../shared/books';

const labels: Record<BookStatus, string> = {
  pending: 'Waiting for review', checking: 'In review', approved: 'Approved',
  rejected: 'Needs changes', unverified: 'Review unavailable',
};
const hints: Record<BookStatus, string> = {
  pending: 'Your book is private while it waits.', checking: 'Your book is being checked.',
  approved: 'Your book is available in the library.', rejected: 'Your book was not approved.',
  unverified: 'The review could not be completed. Try again later.',
};
function date(value: string) {
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
export function ReviewStatus({ book, daily }: { book: BookUploadSummary; daily: boolean }) {
  const incomplete = book.uploadComplete === false;
  const reason = ['rejected', 'unverified'].includes(book.status) ? book.reason : null;
  return <section className="review-details" aria-label={`Review status for ${book.title}`}>
    <span className={`status ${book.status}`}>{incomplete ? 'Upload incomplete' : labels[book.status]}</span>
    <p>{incomplete ? 'Upload the PDF again to submit a new copy.' : reason || hints[book.status]}</p>
    {daily && !incomplete && book.status === 'pending' && <p>Reviews run daily.</p>}
    {book.submittedAt && <p>Submitted <time dateTime={book.submittedAt}>{date(book.submittedAt)}</time></p>}
    {book.reviewedAt && <p>Last reviewed <time dateTime={book.reviewedAt}>{date(book.reviewedAt)}</time></p>}
  </section>;
}
