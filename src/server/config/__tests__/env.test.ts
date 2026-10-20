import { it, expect } from 'vitest';
import { loadConfig } from '../env.js';
const input = { MONGODB_URI: 'mongodb://127.0.0.1:27017/vetify_books', LOCAL_STORAGE_SECRET: 's'.repeat(32), SESSION_ENCRYPTION_KEY: 'a'.repeat(64) };
it('requires the Books database, real secrets, exact callbacks and private production storage', () => {
  expect(loadConfig(input).PORT).toBe(8102);
  for (const changes of [{ MONGODB_URI: 'mongodb://localhost/vetify' }, { SESSION_ENCRYPTION_KEY: 'placeholder' },
    { LOCAL_STORAGE_SECRET: '<replace_this_placeholder_with_a_random_secret>' }, { AUTH_CALLBACK_URL: 'https://attacker.invalid/callback' },
    { MAIN_AUTH_ORIGIN: 'http://localhost:8000/path' }, { NODE_ENV: 'production' },
    { BOOKS_STORAGE: 'vercel-blob', BLOB_STORE_ID: '<private_books_store>' }])
    expect(() => loadConfig({ ...input, ...changes })).toThrow();
});
it('accepts private Vercel production configuration and requires the daily cron secret', () => {
  const production = { ...input, NODE_ENV: 'production', BOOKS_STORAGE: 'vercel-blob', BLOB_STORE_ID: 'store_books',
    MAIN_AUTH_ORIGIN: 'https://main.invalid', CLIENT_ORIGIN: 'https://books.invalid', AUTH_CALLBACK_URL: 'https://books.invalid/auth/callback',
    CRON_SECRET: 'c'.repeat(32), MAIN_AUTH_SERVICE_TOKEN: 'books-only-credential' };
  expect(loadConfig(production).BOOKS_STORAGE).toBe('vercel-blob');
  expect(() => loadConfig({ ...production, CRON_SECRET: undefined })).toThrow('CRON_SECRET');
  expect(() => loadConfig({ ...production, BOOKS_STORAGE: 'local' })).toThrow('Vercel Blob');
});
