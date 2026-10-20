import { Router } from 'express';
import { z } from 'zod';
import type { Sessions } from '../auth/session.js';
import type { StorageAdapter } from '../storage/types.js';
import { disposition } from '../storage/types.js';
import { assert } from '../errors.js';
import { bookAffiliatePage } from '../models/affiliate.js';
import { bookAllowance, recordBookCommission } from '../models/commissions.js';
import { bookId, pagination, summary } from './schemas.js';
import { uploadRoutes } from './uploads.js';

export function booksRoutes(sessions: Sessions, storage: StorageAdapter) {
  const router = Router();
  const { repo } = sessions;
  router.use(uploadRoutes(sessions, storage));
  for (const mine of [false, true]) router.get(mine ? '/mine' : '/', async (req, res) => {
    const { identity } = await sessions.require(req);
    if (mine) assert(identity.user.role === 'professional', 403, 'Professional account required.');
    const { page } = pagination.parse(req.query);
    const filter = mine ? { author: identity.user.id } : { status: 'approved' as const };
    const [books, total] = await Promise.all([
      repo.books().find(filter).sort({ createdAt: -1 }).skip((page - 1) * 12).limit(12).toArray(),
      repo.books().countDocuments(filter),
    ]);
    res.json({ items: books.map((book) => summary(book, mine)), total, page, pages: Math.max(1, Math.ceil(total / 12)) });
  });
  router.get('/affiliate', async (req, res) => {
    const { identity } = await sessions.require(req);
    assert(identity.user.role === 'professional', 403, 'Professional account required.');
    const { page } = pagination.parse(req.query);
    res.json(await bookAffiliatePage(repo, identity.user.id, page));
  });
  router.get('/:id/allowance', async (req, res) => {
    const { identity } = await sessions.require(req);
    const _id = bookId(req.params.id);
    assert(await repo.books().findOne({ _id, status: 'approved' }), 404, 'Book not found.');
    res.json(await bookAllowance(repo, identity.user.id, _id.toHexString()));
  });
  router.post('/:id/download', async (req, res) => {
    const { identity } = await sessions.require(req, true);
    const _id = bookId(req.params.id);
    const requestId = z.string().uuid().parse(req.get('Idempotency-Key'));
    const book = await repo.books().findOne({ _id, status: 'approved' });
    assert(book?.object, 404, 'Book not found.');
    const url = await storage.download(book.object, disposition(book.title));
    await recordBookCommission(repo, identity.user.id, _id, book.author, requestId);
    res.json({ url, expiresIn: 60 });
  });
  return router;
}
