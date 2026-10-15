import { beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app.js';
import type { Repository } from '../models/database.js';
import { testDatabase } from './database.js';
import { config, FakeAuth, MemoryStorage, identity } from './fixtures.js';
import { digest, seal } from '../auth/crypto.js';

export function routeFixture() {
  const state = { repo: undefined as unknown as Repository, app: undefined as unknown as Express,
    auth: new FakeAuth(), storage: new MemoryStorage(), cookie: 'books_session=offline-cookie', csrf: 'offline-csrf' };
  let database: Awaited<ReturnType<typeof testDatabase>>;
  beforeAll(async () => {
    database = await testDatabase();
    state.repo = database.repo;
    state.app = createApp(config, state.repo, state.auth, state.storage).app;
  });
  beforeEach(async () => {
    await Promise.all(['books', 'book_download_quotas', 'books_sessions', 'books_rate_limits', 'books_login_transactions']
      .map((name) => state.repo.db.collection(name).deleteMany({})));
    state.auth.current = identity(); state.auth.disabled = false; state.auth.unavailable = false;
    state.storage.objects.clear();
    await state.repo.sessions().insertOne({ _id: digest('offline-cookie'), encryptedToken: seal('offline-token', config.SESSION_ENCRYPTION_KEY),
      csrf: state.csrf, expiresAt: new Date(Date.now() + 3600000) });
  });
  afterAll(async () => { await database?.close(); });
  function get(path: string) { return request(state.app).get(`/api/v1${path}`).set('Cookie', state.cookie); }
  function post(path: string, body?: object) {
    return request(state.app).post(`/api/v1${path}`).set('Cookie', state.cookie).set('Origin', config.CLIENT_ORIGIN)
      .set('X-CSRF-Token', state.csrf).send(body ?? {});
  }
  return { state, get, post };
}
