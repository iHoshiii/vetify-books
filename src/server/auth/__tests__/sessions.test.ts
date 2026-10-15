import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { routeFixture } from '../../test-utils/routes.js';
import { config } from '../../test-utils/fixtures.js';

const { state: s, get, post } = routeFixture();
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
});
