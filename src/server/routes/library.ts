import { Router } from 'express';
import { z } from 'zod';
import type { Sessions } from '../auth/session.js';
import type { StorageAdapter } from '../storage/types.js';
import { disposition } from '../storage/types.js';
import { assert } from '../errors.js';
import { libraryPage, libraryQuery } from '../models/library.js';
import { bookId } from './schemas.js';

export function libraryRoutes(sessions: Sessions, storage: StorageAdapter) {
  const router = Router();
  const { repo } = sessions;
  for (const mine of [false, true]) router.get(mine ? '/mine' : '/', async (req, res) => {
    const { identity } = await sessions.require(req);
    if (mine) assert(identity.user.role === 'professional', 403, 'Professional account required.');
    res.json(await libraryPage(repo, identity.user.id, mine, libraryQuery.parse(req.query)));
  });
  router.post('/:id/save', async (req, res) => {
    const { identity } = await sessions.require(req, true);
    const _id = bookId(req.params.id);
    const { saved } = z.object({ saved: z.boolean() }).strict().parse(req.body);
    const key = `${identity.user.id}:${_id.toHexString()}`;
    if (saved) {
      assert(await repo.books().findOne({ _id, status: 'approved' }), 404, 'Book not found.');
      await repo.saved().updateOne({ _id: key }, { $setOnInsert: {
        userId: identity.user.id, bookId: _id, createdAt: new Date(),
      } }, { upsert: true });
    } else await repo.saved().deleteOne({ _id: key, userId: identity.user.id });
    res.json({ saved });
  });
  router.post('/:id/preview', async (req, res) => {
    await sessions.require(req, true);
    const book = await repo.books().findOne({ _id: bookId(req.params.id), status: 'approved' });
    assert(book?.object, 404, 'Book not found.');
    res.json({ url: await storage.preview(book.object, disposition(book.title)), expiresIn: 60 });
  });
  return router;
}
