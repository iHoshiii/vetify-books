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
});
