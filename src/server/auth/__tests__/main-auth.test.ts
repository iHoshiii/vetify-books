import { describe, it, expect, vi } from 'vitest';
import { MainAuth, validateIdentity, validateCapability } from '../main-auth.js';
import { config, identity } from '../../test-utils/fixtures.js';

describe('Main account contract', () => {
  it('accepts authoritative version-2 identities and never merges by provider or email', () => {
    const google = identity('immutable-id'); google.providers = ['google'];
    expect(validateIdentity(google, config).user.id).toBe('immutable-id');
    const linked = { ...google, providers: ['google', 'password'] };
    expect(validateIdentity(linked, config).user.id).toBe('immutable-id');
  });
  it('fails closed for v1, wrong issuer/audience, expiry, disabled and unverified accounts', () => {
    for (const changes of [{ version: 1 }, { issuer: 'https://attacker.invalid' }, { audience: 'vetify-blog' },
      { emailVerified: false }, { sessionActive: false }, { validUntil: new Date(0).toISOString() },
      { validUntil: new Date(Date.now() + 120000).toISOString() }, { tokenExpiresAt: new Date(0).toISOString() },
      { user: { ...identity().user, status: 'disabled' } }]) {
      expect(() => validateIdentity({ ...identity(), ...changes }, config)).toThrow();
    }
  });
  it('requires a dedicated capability credential and checks the returned owner', async () => {
    const fetcher = vi.fn(async () => Response.json(identity('someone-else')));
    await expect(new MainAuth(config, fetcher).capability('author')).rejects.toMatchObject({ status: 503 });
    const adapter = new MainAuth({ ...config, MAIN_AUTH_SERVICE_TOKEN: 'books-service-credential' }, fetcher);
    await expect(adapter.capability('author')).rejects.toMatchObject({ status: 403 });
  });
  it('checks author approval independently of a currently open browser session', () => {
    const { sessionActive: _session, providers: _providers, tokenExpiresAt: _expiry, ...author } = identity();
    expect(validateCapability(author, config).user.id).toBe('main-professional');
    expect(() => validateCapability({ ...author, audience: 'another-app' }, config)).toThrow();
  });
  it('surfaces main account errors without inventing or merging local identities', async () => {
    for (const [error, message] of [['unknown_account', 'Create an account first to use the app.'],
      ['account_exists', 'Account already exist. Please login'],
      ['provider_not_linked', 'Link this login method explicitly in your main Vetify account.']]) {
      const fetcher = vi.fn(async () => Response.json({ error }, { status: 400 }));
      const callback = new URL(config.AUTH_CALLBACK_URL);
      callback.search = new URLSearchParams({ code: 'code', state: 'state', iss: config.MAIN_AUTH_ORIGIN }).toString();
      await expect(new MainAuth(config, fetcher).exchange(callback, 'state', 'v'.repeat(43))).rejects.toThrow(message);
    }
  });
  it('fails closed when introspection is unavailable and never follows redirects', async () => {
    const fetcher = vi.fn(async () => { throw new Error('offline'); });
    await expect(new MainAuth(config, fetcher).introspect('private-token')).rejects.toMatchObject({ status: 503 });
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store', redirect: 'error' });
  });
  it('binds the code exchange to state, issuer, callback and PKCE verifier', async () => {
    const fetcher = vi.fn(async () => Response.json({ access_token: 'books-token', token_type: 'Bearer', expires_in: 3600 }));
    const adapter = new MainAuth(config, fetcher);
    const state = 'random-state'; const verifier = 'v'.repeat(43);
    const authorize = new URL(await adapter.authorizationUrl(state, verifier));
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('code_challenge')).not.toBe(verifier);
    const callback = new URL(config.AUTH_CALLBACK_URL);
    callback.search = new URLSearchParams({ code: 'single-use-code', state, iss: config.MAIN_AUTH_ORIGIN }).toString();
    expect(await adapter.exchange(callback, state, verifier)).toEqual({ token: 'books-token', expiresIn: 3600 });
    const payload = fetcher.mock.calls[0][1]?.body as URLSearchParams;
    expect(payload.get('code_verifier')).toBe(verifier);
    expect(payload.get('redirect_uri')).toBe(config.AUTH_CALLBACK_URL);
    await expect(adapter.exchange(callback, 'wrong-state', verifier)).rejects.toMatchObject({ status: 401 });
    callback.searchParams.set('iss', 'https://attacker.invalid');
    await expect(adapter.exchange(callback, state, verifier)).rejects.toMatchObject({ status: 401 });
  });
});
