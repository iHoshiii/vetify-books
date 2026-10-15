import { randomBytes } from 'node:crypto';
import { createApp } from '../dist/server/server/app.js';
import { loadConfig } from '../dist/server/server/config/env.js';
import { MainAuth } from '../dist/server/server/auth/main-auth.js';
import { VercelBlobStorage } from '../dist/server/server/storage/vercel-blob.js';
import { inspectBookPdf } from '../dist/server/server/services/pdf-inspection.js';
import { makeBookPdf } from '../src/server/test-utils/book-pdf.ts';

const config = loadConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/vetify_books',
  MAIN_AUTH_ORIGIN: 'https://main.invalid', CLIENT_ORIGIN: 'https://books.invalid', AUTH_CALLBACK_URL: 'https://books.invalid/auth/callback',
  LOCAL_STORAGE_SECRET: randomBytes(32).toString('hex'), SESSION_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  BOOKS_STORAGE: 'vercel-blob', BLOB_STORE_ID: 'offline-books-store', CRON_SECRET: randomBytes(32).toString('hex'),
  MAIN_AUTH_SERVICE_TOKEN: 'offline-test-capability' });
const { app } = createApp(config, {}, new MainAuth(config), new VercelBlobStorage(config.BLOB_STORE_ID));
const server = app.listen(0, '127.0.0.1');
await new Promise((resolve) => server.once('listening', resolve));
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${origin}/api/v1/health`);
  if (health.status !== 200 || (await health.json()).service !== 'vetify-books') throw new Error('Built API health failed.');
  const books = await fetch(`${origin}/api/v1/books`);
  if (books.status !== 401) throw new Error('Built API allowed anonymous library access.');
  const upload = await fetch(`${origin}/api/v1/storage/upload/anything`, { method: 'PUT' });
  if (upload.status !== 404) throw new Error('Production API exposes a PDF transfer route.');
  process.env.VERCEL = '1';
  const inspection = await inspectBookPdf(makeBookPdf([['Animal welfare education.']]));
  if (!('pages' in inspection) || !inspection.pages[0].includes('Animal welfare')) throw new Error('Built PDF worker failed.');
  console.log('Built API, production transfer boundary, and emitted PDF worker passed.');
} finally {
  await new Promise((resolve) => server.close(resolve));
}
