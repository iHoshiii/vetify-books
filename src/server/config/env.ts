import { z } from 'zod';

const url = z.string().url();
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8102),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//),
  MONGODB_DATABASE: z.string().regex(/^[a-zA-Z0-9_-]+$/).default('vetify_books'),
  MAIN_AUTH_ORIGIN: url.default('http://localhost:8000'),
  AUTH_CLIENT_ID: z.string().min(1).default('vetify-books'),
  AUTH_CALLBACK_URL: url.default('http://localhost:5175/auth/callback'),
  CLIENT_ORIGIN: url.default('http://localhost:5175'),
  BOOKS_STORAGE: z.enum(['local', 'vercel-blob']).default('local'),
  BLOB_STORE_ID: z.string().optional(),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  CRON_SECRET: z.string().min(32).optional(),
  LOCAL_STORAGE_DIR: z.string().default('.data/pdfs'),
  LOCAL_STORAGE_SECRET: z.string().min(32).optional(),
  SESSION_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  MAIN_AUTH_SERVICE_TOKEN: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_BOOK_MODEL: z.string().default('gemini-3.5-flash'),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(input = process.env): Config {
  const config = schema.parse(input);
  const database = new URL(config.MONGODB_URI).pathname.slice(1);
  if (database !== config.MONGODB_DATABASE || ['admin', 'local', 'config', 'vetify'].includes(database))
    throw new Error('MONGODB_URI must name the configured Books-only database.');
  const origins = [config.MAIN_AUTH_ORIGIN, config.CLIENT_ORIGIN];
  if (origins.some((value) => new URL(value).origin !== value))
    throw new Error('Auth and client origins must be exact origins, without paths.');
  if (new URL(config.AUTH_CALLBACK_URL).origin !== config.CLIENT_ORIGIN)
    throw new Error('Auth callback must belong to CLIENT_ORIGIN.');
  const callback = new URL(config.AUTH_CALLBACK_URL);
  if (callback.pathname !== '/auth/callback' || callback.search || callback.hash)
    throw new Error('Auth callback must be the exact /auth/callback URL.');
  if (config.BOOKS_STORAGE === 'local' && (!config.LOCAL_STORAGE_SECRET || config.LOCAL_STORAGE_SECRET.startsWith('<')))
    throw new Error('Replace the local storage secret placeholder with a random secret.');
  if (config.BOOKS_STORAGE === 'vercel-blob' && (!config.BLOB_STORE_ID || config.BLOB_STORE_ID.startsWith('<')))
    throw new Error('Vercel Blob storage requires the private Books BLOB_STORE_ID.');
  if (config.BLOB_READ_WRITE_TOKEN?.startsWith('<'))
    throw new Error('Replace or omit the optional Blob token placeholder.');
  if (config.NODE_ENV === 'production') {
    if ([...origins, config.AUTH_CALLBACK_URL].some((value) => !value.startsWith('https://')))
      throw new Error('Production authentication and client addresses require HTTPS.');
    if (config.BOOKS_STORAGE !== 'vercel-blob')
      throw new Error('Production requires a private Books Vercel Blob store.');
    if (!config.CRON_SECRET || config.CRON_SECRET.startsWith('<'))
      throw new Error('Production requires a random CRON_SECRET for daily screening.');
    if (!config.MAIN_AUTH_SERVICE_TOKEN || config.MAIN_AUTH_SERVICE_TOKEN.startsWith('<'))
      throw new Error('Production requires the Books capability service credential.');
  }
  return config;
}
