import { useEffect, useState } from 'react';
import { api } from '../api';
import { LoadingScreen } from '../components/loading-screen';

export default function AuthCallback() {
  const [error, setError] = useState('');
  useEffect(() => {
    const search = window.location.search;
    window.history.replaceState(null, '', '/auth/callback');
    void api<{ returnTo?: string }>('/auth/callback', { method: 'POST', body: JSON.stringify({ search }) })
      .then((result) => window.location.replace(result.returnTo ?? '/'))
      .catch((failure: Error) => setError(failure.message));
  }, []);
  if (!error) return <LoadingScreen fullScreen />;
  return <main className="error-screen"><h1>Unable to sign in</h1>
    <p role="alert">{error}</p><a className="button" href="/api/v1/auth/login">Try again</a></main>;
}
