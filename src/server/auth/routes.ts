import { Router } from 'express';
import { assert } from '../errors.js';
import { digest, opaque } from './crypto.js';
import type { Sessions } from './session.js';

export function authRoutes(sessions: Sessions) {
  const router = Router();
  const { repo, auth, config } = sessions;
  const loginCookie = config.NODE_ENV === 'production' ? '__Host-books_login' : 'books_login';
  router.get('/login', async (req, res) => {
    assert(await repo.rateLimit(req.ip ?? 'unknown', 'login', 30, 60000), 429, 'Too many sign-in attempts. Try again shortly.');
    const raw = opaque();
    const state = opaque();
    const verifier = opaque();
    const nonce = opaque();
    const returnTo = typeof req.query.returnTo === 'string' && ['/', '/manage', '/affiliate'].includes(req.query.returnTo)
      ? req.query.returnTo : '/';
    const destination = await auth.authorizationUrl(state, verifier, nonce);
    await repo.logins().insertOne({ _id: digest(raw), state, verifier, nonce, returnTo, expiresAt: new Date(Date.now() + 300000) });
    res.cookie(loginCookie, raw, sessions.options(300000));
    res.redirect(destination);
  });
  router.post('/callback', async (req, res) => {
    assert(req.get('Origin') === config.CLIENT_ORIGIN, 403, 'Invalid sign-in origin.');
    const raw = req.cookies?.[loginCookie];
    assert(typeof raw === 'string' && raw.length < 200, 401, 'Sign-in request expired.');
    const login = await repo.logins().findOneAndDelete({ _id: digest(raw), expiresAt: { $gt: new Date() } });
    res.clearCookie(loginCookie, sessions.options());
    assert(login && typeof req.body?.search === 'string' && req.body.search.length < 4096,
      401, 'Sign-in request expired or was already used.');
    const callback = new URL(config.AUTH_CALLBACK_URL);
    callback.search = req.body.search;
    assert(login.nonce, 401, 'Sign-in request expired. Start again from Books.');
    const grant = await auth.exchange(callback, login.state, login.verifier, login.nonce);
    const identity = await auth.introspect(grant.token);
    assert(!grant.subject || grant.subject === identity.user.id, 401, 'Main returned a mismatched app session.');
    await sessions.logout(req, res);
    await sessions.create(res, grant.token, grant.expiresIn);
    res.json({ ok: true, returnTo: login.returnTo ?? '/' });
  });
  router.get('/me', async (req, res) => {
    const { identity, csrf } = await sessions.require(req);
    res.json({ user: identity.user, professional: identity.professional, csrf,
      mainOrigin: config.MAIN_AUTH_ORIGIN, screeningSchedule: config.NODE_ENV === 'production' ? 'daily' : 'continuous' });
  });
  router.post('/logout', async (req, res) => {
    await sessions.local(req, true);
    await sessions.logout(req, res);
    res.json({ ok: true });
  });
  return router;
}
