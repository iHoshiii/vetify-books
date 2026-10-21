import { describe, expect, it, vi } from 'vitest';
import { MainAuth } from '../main-auth.js';
import { oidcFixture } from './oidc-fixture.js';

describe('Books shared Vetify sign-in', () => {
  it('discovers the real provider and uses PKCE, state and nonce without forcing another login', async () => {
    const { adapter, issuer } = oidcFixture();
    const url = new URL(await adapter.authorizationUrl('state', 'v'.repeat(43), 'nonce'));
    expect(url.origin + url.pathname).toBe(`${issuer}/auth`);
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('nonce')).toBe('nonce');
    expect(url.searchParams.get('state')).toBe('state');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).not.toBe('v'.repeat(43));
    expect(url.searchParams.has('prompt')).toBe(false);
  });
  it('authenticates the Books client and verifies the signed ID token before establishing a session', async () => {
    const { adapter, fetcher, callback, settings } = oidcFixture();
    expect(await adapter.exchange(callback, 'state', 'v'.repeat(43), 'nonce'))
      .toEqual({ token: 'books-token', expiresIn: 3600, subject: 'main-professional' });
    const tokenCall = fetcher.mock.calls.find(([url]) => String(url).endsWith('/token'))!;
    const body = tokenCall[1]?.body as URLSearchParams;
    expect(body.get('client_secret')).toBe(settings.AUTH_CLIENT_SECRET);
    expect(body.get('code_verifier')).toBe('v'.repeat(43));
    expect(body.get('redirect_uri')).toBe(settings.AUTH_CALLBACK_URL);
  });
  it('rejects wrong state, issuer, nonce, audience, expired IDs and invalid signatures', async () => {
    const fixture = oidcFixture();
    await expect(fixture.adapter.exchange(fixture.callback, 'wrong', 'v'.repeat(43), 'nonce')).rejects.toMatchObject({ status: 401 });
    fixture.callback.searchParams.set('iss', 'https://attacker.invalid');
    await expect(fixture.adapter.exchange(fixture.callback, 'state', 'v'.repeat(43), 'nonce')).rejects.toMatchObject({ status: 401 });
    for (const change of [{ nonce: 'wrong' }, { aud: 'vetify-anatomy' }, { exp: 1 }]) {
      const { adapter, state, callback } = oidcFixture(); state.idClaims = change;
      await expect(adapter.exchange(callback, 'state', 'v'.repeat(43), 'nonce')).rejects.toMatchObject({ status: 401 });
    }
    const { adapter, state, callback } = oidcFixture(); state.corruptSignature = true;
    await expect(adapter.exchange(callback, 'state', 'v'.repeat(43), 'nonce')).rejects.toMatchObject({ status: 401 });
  });
  it('requires a current Books OIDC session and separately checks authoritative account capabilities', async () => {
    const { adapter, fetcher } = oidcFixture();
    const account = await adapter.introspect('opaque-access-token');
    expect(account.user.id).toBe('main-professional');
    expect(account.sessionActive).toBe(true);
    const capabilityCall = fetcher.mock.calls.find(([url]) => String(url).endsWith('/books-capabilities'))!;
    expect(JSON.parse(capabilityCall[1]?.body as string)).toEqual({ userId: 'main-professional', audience: 'vetify-books' });
  });
  it('rejects revoked, expired, cross-client and unverified identities before capability lookups', async () => {
    for (const changes of [{ active: false }, { aud: 'vetify-anatomy' }, { client_id: 'vetify-anatomy' },
      { iss: 'https://attacker.invalid' }, { exp: 1 }, { email_verified: false }, { account_active: false }]) {
      const { adapter, state, fetcher } = oidcFixture(); state.introspection = changes;
      await expect(adapter.introspect('token')).rejects.toMatchObject({ status: 401 });
      expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/books-capabilities'))).toBe(false);
    }
  });
  it('never sends the client secret to a foreign discovery endpoint', async () => {
    const { adapter, state, fetcher } = oidcFixture(); state.metadata = { token_endpoint: 'https://attacker.invalid/token' };
    await expect(adapter.authorizationUrl('state', 'v'.repeat(43), 'nonce')).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('fails closed on unavailable discovery and disables caching and redirects', async () => {
    const { settings } = oidcFixture();
    const fetcher = vi.fn<typeof fetch>(async () => { throw new Error('offline'); });
    await expect(new MainAuth(settings, fetcher).introspect('token')).rejects.toMatchObject({ status: 503 });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });
  it('preserves main account errors without creating a separate identity', async () => {
    for (const [code, message] of [['unknown_account', 'Create an account first'], ['account_exists', 'Account already exist'],
      ['provider_not_linked', 'Link this login method explicitly']]) {
      const { adapter, state, callback } = oidcFixture(); state.grantError = code;
      await expect(adapter.exchange(callback, 'state', 'v'.repeat(43), 'nonce')).rejects.toThrow(message);
    }
  });
});
