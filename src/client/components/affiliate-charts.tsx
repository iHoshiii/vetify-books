import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { BookAffiliatePage } from '../../shared/books';

const money = (centavos: number) => `₱${(centavos / 100).toFixed(2)}`;
export function AffiliateCharts({ data }: { data: BookAffiliatePage }) {
  return <div className="chart-grid">
    <section className="chart-panel"><h2>Credits over time</h2><p>Last 30 days · Asia/Singapore</p>
      <div className="chart" role="img" aria-label="Daily earned credits for the last thirty days"><ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.daily}><defs><linearGradient id="creditFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#237b70" stopOpacity={0.24} /><stop offset="100%" stopColor="#237b70" stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7ece9" />
          <XAxis dataKey="date" tickFormatter={(value: string) => value.slice(5)} minTickGap={30} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={money} axisLine={false} tickLine={false} width={60} />
          <Tooltip formatter={(value) => money(Number(value))} />
          <Area type="monotone" dataKey="earningsCentavos" name="Credits" stroke="#237b70" strokeWidth={2} fill="url(#creditFill)" />
        </AreaChart></ResponsiveContainer></div>
    </section>
    <section className="chart-panel"><h2>Most downloaded</h2><p>Top five resources by credited downloads</p>
      {data.topBooks.length ? <div className="chart" role="img" aria-label="Top resources by credited downloads"><ResponsiveContainer width="100%" height="100%">
        <BarChart data={data.topBooks} layout="vertical" margin={{ left: 0, right: 20 }}>
          <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="title" width={100} tickFormatter={(value: string) => value.length > 15 ? `${value.slice(0, 15)}...` : value} axisLine={false} tickLine={false} />
          <Tooltip /><Bar dataKey="downloads" name="Credited downloads" fill="#237b70" radius={[0, 4, 4, 0]} />
        </BarChart></ResponsiveContainer></div> : <div className="chart-empty">Your credited downloads will appear here.</div>}
    </section>
  </div>;
}
