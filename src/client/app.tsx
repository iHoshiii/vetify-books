import { lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ArrowUpRight } from 'lucide-react';
import { AuthProvider, useAuth } from './auth';
import { api } from './api';
import BooksPage from './pages/books-page';
import AuthCallback from './pages/auth-callback';

const AffiliatePage = lazy(() => import('./pages/affiliate-page'));

function Shell() {
  const { account, loading, error } = useAuth();
  const config = useQuery({ queryKey: ['public-config'], queryFn: () => api<{ mainOrigin: string }>('/config'), retry: false });
  const path = window.location.pathname;
  return <>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/"><span className="brand-icon"><BookOpen size={22} /></span>
      <span>vetify<span className="brand-books">books</span></span></a>
      {account && <nav className="main-nav" aria-label="Main navigation"><a className={path === '/' ? 'active' : ''} href="/">Library</a>
        {account.user.role === 'professional' && <><a className={path === '/manage' ? 'active' : ''} href="/manage">My uploads</a>
          <a className={path === '/affiliate' ? 'active' : ''} href="/affiliate">Affiliate</a></>}</nav>}
      <div className="header-account">{account && <span className="account-name">{account.user.name ?? 'Vetify account'}</span>}</div>
    </div></header>
    {loading ? <main className="page"><p role="status">Checking your Vetify session...</p></main> : account ?
      path === '/affiliate' ? <Suspense fallback={<main className="page"><p role="status">Loading activity...</p></main>}><AffiliatePage /></Suspense> : <BooksPage manage={path === '/manage' && account.user.role === 'professional'} /> :
      <main className="page"><p className="notice error" role="alert">{error || config.error?.message || 'Your Vetify session could not be checked. Refresh to try again.'}</p></main>}
    <footer className="site-footer"><span>Vetify Books · Veterinary education</span>
      {config.data && <a href={config.data.mainOrigin} rel="noreferrer">Vetify account & login methods<ArrowUpRight size={13} /></a>}
      <span>Educational resources do not replace professional care.</span></footer>
  </>;
}
export default function App() {
  if (window.location.pathname === '/auth/callback') return <AuthCallback />;
  return <AuthProvider><Shell /></AuthProvider>;
}
