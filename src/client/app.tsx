import { lazy, Suspense, useState } from 'react';
import { AuthProvider, useAuth } from './auth';
import BooksPage from './pages/books-page';
import AuthCallback from './pages/auth-callback';
import { LoadingScreen } from './components/loading-screen';

const AffiliatePage = lazy(() => import('./pages/affiliate-page'));

function Shell() {
  const { account, loading, error } = useAuth();
  const [path, setPath] = useState(window.location.pathname);
  const professional = account?.user.role === 'professional';
  if (loading) return <LoadingScreen fullScreen />;
  if (!account) return <main className="error-screen"><h1>Unable to open Books</h1>
    <p role="alert">{error || 'Please refresh and try again.'}</p><a className="button secondary" href="/">Try again</a></main>;
  return <>
    <header className="site-header"><div className="header-inner"><a className="brand" href="/">Vetify <span>Books</span></a>
      {professional && <nav className="main-nav" aria-label="Main navigation">{[
        ['/', 'Library'], ['/manage', 'My uploads'], ['/affiliate', 'Earnings'],
      ].map(([href, label]) => <a key={href} href={href} aria-current={path === href ? 'page' : undefined}>{label}</a>)}</nav>}
      <div className="header-account">{account.user.name && <span className="account-name">{account.user.name}</span>}
        <a href={account.mainOrigin} className="button secondary back-link">Back to Vetify</a></div>
    </div></header>
    {path === '/affiliate' && professional ? <Suspense fallback={<LoadingScreen />}><AffiliatePage /></Suspense> :
      <BooksPage manage={path === '/manage' && professional} onUploaded={() => {
        window.history.replaceState(null, '', '/manage'); setPath('/manage');
      }} />}
    <footer className="site-footer"><span>Vetify Books</span><span>For learning and reference.</span></footer>
  </>;
}
export default function App() {
  if (window.location.pathname === '/auth/callback') return <AuthCallback />;
  return <AuthProvider><Shell /></AuthProvider>;
}
