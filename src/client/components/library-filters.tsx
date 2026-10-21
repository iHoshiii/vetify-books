import { useEffect, useState, type FormEvent } from 'react';
import { BOOK_TOPICS } from '../../shared/books';

export type LibraryFiltersValue = { q: string; topic: string; saved: boolean };
export function LibraryFilters({ value, mine, onChange }: {
  value: LibraryFiltersValue; mine: boolean; onChange: (value: LibraryFiltersValue) => void;
}) {
  const [search, setSearch] = useState(value.q);
  useEffect(() => setSearch(value.q), [value.q]);
  function submit(event: FormEvent) {
    event.preventDefault(); onChange({ ...value, q: search.trim() });
  }
  return <form className="library-filters" role="search" onSubmit={submit}>
    <div className="search-field"><input type="search" aria-label="Search books" placeholder="Search books" maxLength={100}
      value={search} onChange={event => setSearch(event.target.value)} />
      <button className="button secondary" type="submit">Search</button></div>
    <select aria-label="Filter by topic" value={value.topic} onChange={event => onChange({ ...value, q: search.trim(), topic: event.target.value })}>
      <option value="">All topics</option>{BOOK_TOPICS.map(topic => <option key={topic}>{topic}</option>)}
    </select>
    {!mine && <button type="button" className={`button secondary ${value.saved ? 'is-selected' : ''}`} aria-pressed={value.saved}
      onClick={() => onChange({ ...value, q: search.trim(), saved: !value.saved })}>Saved books</button>}
    {(value.q || value.topic || value.saved) && <button type="button" className="text-button" onClick={() => {
      setSearch(''); onChange({ q: '', topic: '', saved: false });
    }}>Clear</button>}
  </form>;
}
