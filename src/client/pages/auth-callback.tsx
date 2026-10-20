import { useEffect, useState } from 'react';
import { api } from '../api';

export default function AuthCallback() {
  const [error, setError] = useState('');
  useEffect(() => {
    const search = window.location.search;
    window.history.replaceState(null, '', '/auth/callback');
    void api('/auth/callback', { method: 'POST', body: JSON.stringify({ search }) })
      .then(() => window.location.replace('/'))
      .catch((failure: Error) => setError(failure.message));
  }, []);
  return <main className="page"><div className="empty-state"><h1>{error ? 'Sign-in could not be completed' : 'Signing you in...'}</h1>
    {error && <><p role="alert">{error}</p><a className="button" href="/api/v1/auth/login">Try again</a></>}</div></main>;
}
