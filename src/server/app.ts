import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { ZodError } from 'zod';
import type { Config } from './config/env.js';
import type { Repository } from './models/database.js';
import type { AuthAdapter } from './auth/main-auth.js';
import { Sessions } from './auth/session.js';
import { authRoutes } from './auth/routes.js';
import { booksRoutes } from './routes/books.js';
import type { StorageAdapter } from './storage/types.js';
import { LocalStorage } from './storage/local.js';
import { BOOK_MAX_BYTES } from '../shared/books.js';
import { AppError } from './errors.js';

export function createApp(config: Config, repo: Repository, auth: AuthAdapter, storage: StorageAdapter) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Idempotency-Key'], methods: ['GET', 'POST', 'PUT'] }));
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(cookieParser());
  const sessions = new Sessions(repo, auth, config);
  if (storage instanceof LocalStorage && config.NODE_ENV !== 'production') {
    app.put('/api/v1/storage/upload/:ticket', express.raw({ type: 'application/pdf', limit: BOOK_MAX_BYTES }), async (req, res) => {
      if (!Buffer.isBuffer(req.body)) throw new AppError(400, 'Upload must use application/pdf.');
      await storage.accept(String(req.params.ticket), req.body);
      res.status(204).end();
    });
    app.get('/api/v1/storage/download/:ticket', async (req, res) => {
      const { bytes, filename, inline } = await storage.fetchDownload(String(req.params.ticket));
      res.set('Content-Type', 'application/pdf').set('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${filename}"`).send(bytes);
    });
  }
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/v1/health', (_req, res) => res.json({ service: 'vetify-books', status: 'ok' }));
  app.get('/api/v1/config', (_req, res) => res.json({ mainOrigin: config.MAIN_AUTH_ORIGIN }));
  app.use('/api/v1/auth', authRoutes(sessions));
  app.use('/api/v1/books', booksRoutes(sessions, storage));
  app.use((_req, _res, next) => next(new AppError(404, 'Not found.')));
  const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (error instanceof AppError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof ZodError) { res.status(400).json({ error: 'Check the submitted fields and try again.' }); return; }
    if ((error as { type?: string }).type === 'entity.too.large') {
      res.status(413).json({ error: 'Upload a PDF document of up to 10 MB.' }); return;
    }
    if ((error as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body must be valid JSON.' }); return;
    }
    console.error('[books] request failed', error instanceof Error ? error.name : 'unknown');
    res.status(503).json({ error: 'Books is temporarily unavailable. Try again shortly.' });
  };
  app.use(errorHandler);
  return { app, sessions };
}
