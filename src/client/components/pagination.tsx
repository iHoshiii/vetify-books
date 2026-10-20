export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return <nav className="pagination" aria-label="Pages">
    <button className="button secondary small" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
    <span>Page {page} of {pages}</span>
    <button className="button secondary small" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
  </nav>;
}
