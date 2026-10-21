import { afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { routeFixture } from '../../test-utils/routes.js';
import { config } from '../../test-utils/fixtures.js';

const { state: s, get, post } = routeFixture();
afterEach(() => vi.restoreAllMocks());
describe('Books sign-in session boundary', () => {
  it('uses single-use login transactions and encrypted server-side tokens', async () => {
    const login = await request(s.app).get('/api/v1/auth/login');
    const url = new URL(login.headers.location);
    const loginCookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const body = { search: `?code=main-code&state=${url.searchParams.get('state')}` };
    const results = await Promise.all(Array.from({ length: 2 }, () => request(s.app).post('/api/v1/auth/callback')
      .set('Origin', config.CLIENT_ORIGIN).set('Cookie', loginCookie).send(body)));
    expect(results.map((result) => result.status).sort()).toEqual([200, 401]);
    const session = (await s.repo.sessions().findOne({ _id: { $ne: 'offline-cookie' } }))!;
    expect(session.encryptedToken).not.toContain('main-test-token');
    expect(await s.repo.db.listCollections({ name: 'users' }).toArray()).toEqual([]);
    expect(results.find((result) => result.status === 200)!.headers['set-cookie'].join(' ')).toContain('HttpOnly');
  });
  it('rejects callback state tampering and expired login transactions', async () => {
    const login = await request(s.app).get('/api/v1/auth/login');
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    expect((await request(s.app).post('/api/v1/auth/callback').set('Origin', config.CLIENT_ORIGIN).set('Cookie', cookie)
      .send({ search: '?code=x&state=wrong' })).status).toBe(401);
    const expired = await request(s.app).get('/api/v1/auth/login');
    await s.repo.logins().updateMany({}, { $set: { expiresAt: new Date(0) } });
    expect((await request(s.app).post('/api/v1/auth/callback').set('Origin', config.CLIENT_ORIGIN)
      .set('Cookie', (expired.headers['set-cookie'] as unknown as string[])[0].split(';')[0]).send({ search: '?code=x' })).status).toBe(401);
  });
  it('honors current account/session revocation and performs local logout', async () => {
    expect((await get('/auth/me')).status).toBe(200);
    s.auth.disabled = true; expect((await get('/auth/me')).status).toBe(401);
    expect((await post('/auth/logout')).status).toBe(200);
    s.auth.disabled = false;
    expect((await get('/auth/me')).status).toBe(401);
  });
  it('binds the nonce and preserves only supported Books return paths', async () => {
    for (const [requested, expected] of [['/manage', '/manage'], ['https://attacker.invalid', '/'], ['//attacker.invalid', '/']]) {
      const login = await request(s.app).get('/api/v1/auth/login').query({ returnTo: requested });
      const url = new URL(login.headers.location);
      const transaction = await s.repo.logins().findOne({ state: url.searchParams.get('state')! });
      expect(transaction?.nonce).toBe(url.searchParams.get('nonce'));
      expect(transaction?.nonce).not.toBe(transaction?.verifier);
      const callback = await request(s.app).post('/api/v1/auth/callback').set('Origin', config.CLIENT_ORIGIN)
        .set('Cookie', (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0])
        .send({ search: `?code=code&state=${url.searchParams.get('state')}` });
      expect(callback.status).toBe(200);
      expect(callback.body.returnTo).toBe(expected);
    }
  });
  it('rejects a mismatch between the signed ID token and the access-token account', async () => {
    const initialSessions = await s.repo.sessions().countDocuments();
    const login = await request(s.app).get('/api/v1/auth/login');
    const state = new URL(login.headers.location).searchParams.get('state');
    vi.spyOn(s.auth, 'exchange').mockImplementation(async () => ({ token: 'main-test-token', expiresIn: 3600, subject: 'different-account' }));
    const callback = await request(s.app).post('/api/v1/auth/callback').set('Origin', config.CLIENT_ORIGIN)
      .set('Cookie', (login.headers['set-cookie'] as unknown as string[])[0].split(';')[0])
      .send({ search: `?code=code&state=${state}` });
    expect(callback.status).toBe(401);
    expect(await s.repo.sessions().countDocuments()).toBe(initialSessions);
  });
});
