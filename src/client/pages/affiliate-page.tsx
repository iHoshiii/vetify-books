import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { BookAffiliatePage } from '../../shared/books';
import { useAuth } from '../auth';
import { api } from '../api';
import { AffiliateCharts } from '../components/affiliate-charts';
import { Pagination } from '../components/pagination';
import { LoadingScreen } from '../components/loading-screen';

const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value / 100);
export default function AffiliatePage() {
  const { account } = useAuth();
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['affiliate', account?.user.id, page],
    queryFn: () => api<BookAffiliatePage>(`/books/affiliate?page=${page}`), enabled: account?.user.role === 'professional', retry: false });
  if (account?.user.role !== 'professional') return <main className="page"><p role="alert">Professional account required.</p></main>;
  const data = query.data;
  return <main className="page">
    <header className="page-heading"><div><h1>Earnings</h1><p>Credits from your books.</p></div>
      <a href="/manage" className="button secondary">My uploads</a></header>
    <p className="notice ledger-note">Credits track eligible downloads. Payments and withdrawals are not available.</p>
    {query.isPending && <LoadingScreen />}
    {query.error && <p className="notice error" role="alert">{query.error.message}</p>}
    {data && <>
      <div className="stats-grid">{[
        { label: 'Total tracked credits', value: money(data.earningsCentavos) },
        { label: 'Credits this month', value: money(data.monthEarningsCentavos) },
        { label: 'Credited downloads', value: data.downloads.toLocaleString() },
      ].map((stat) => <div className="stat-card" key={stat.label}><div>{stat.label}</div><strong>{stat.value}</strong></div>)}</div>
      <AffiliateCharts data={data} />
      <section className="table-panel"><h2>Your resources</h2><div className="table-scroll"><table>
        <thead><tr><th>Document</th><th>Credited downloads</th><th>Tracked credits</th></tr></thead>
        <tbody>{data.items.map((book) => <tr key={book.id}><td>{book.title}</td><td>{book.downloads}</td><td>{money(book.earningsCentavos)}</td></tr>)}</tbody>
      </table>{!data.items.length && <p className="table-empty">You have no uploaded documents yet.</p>}</div></section>
      <p className="affiliate-rules">An eligible download earns {money(data.rateCentavos)}. The first three downloads per reader, book, and calendar month earn credits. Self-downloads earn zero.</p>
      <Pagination page={page} pages={data.pages} onChange={setPage} />
    </>}
  </main>;
}
