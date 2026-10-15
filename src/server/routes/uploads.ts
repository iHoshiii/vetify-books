import { Router } from 'express';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import type { Sessions } from '../auth/session.js';
import { verified } from '../auth/main-auth.js';
import { assert } from '../errors.js';
import type { StorageAdapter } from '../storage/types.js';
import { bookId, summary, uploadSchema } from './schemas.js';

export function uploadRoutes(sessions: Sessions, storage: StorageAdapter) {
  const router = Router();
  const { repo } = sessions;
  router.post('/uploads', async (req, res) => {
    const { identity } = await sessions.require(req, true);
    verified(identity);
    const input = uploadSchema.parse(req.body);
    assert(await repo.rateLimit(identity.user.id, 'screening'), 429, 'Too many submissions. Try again in an hour.');
    assert(!await repo.books().findOne({ contentHash: input.sha256 }), 409,
      'An identical document has already been uploaded. Check My uploads if it belongs to you.');
    const stagingKey = `incoming/${randomUUID()}.pdf`;
    const grant = await storage.upload(stagingKey, input.size);
    const book = { _id: new ObjectId(), author: identity.user.id, uploadedBy: identity.user.name ?? 'Vet professional',
      title: input.title, description: input.description, topic: input.topic, size: input.size,
      declaredHash: input.sha256, stagingKey, createdAt: new Date(), status: 'pending' as const,
      uploadExpiresAt: new Date(Date.now() + 300000) };
    await repo.books().insertOne(book);
    res.status(201).json({ book: summary(book, true), upload: grant });
  });
  router.post('/:id/complete', async (req, res) => {
    const { identity } = await sessions.require(req, true);
    verified(identity);
    const _id = bookId(req.params.id);
    const book = await repo.books().findOne({ _id, author: identity.user.id });
    assert(book, 404, 'Book not found.');
    if (book.completedAt) { res.json({ book: summary(book, true) }); return; }
    assert(book.uploadExpiresAt > new Date(), 409, 'Upload link expired. Start a new submission.');
    const incoming = await storage.head(book.stagingKey);
    assert(incoming.size === book.size, 400, 'PDF size does not match the declared submission.');
    const object = await storage.quarantine(incoming);
    const completed = await repo.books().findOneAndUpdate({ _id, author: identity.user.id, completedAt: { $exists: false } },
      { $set: { object, completedAt: new Date(), job: { readyAt: new Date(), attempts: 0, uncertainChecks: 0 } } },
      { returnDocument: 'after' });
    const current = completed ?? await repo.books().findOne({ _id, author: identity.user.id });
    res.json({ book: summary(current!, true) });
  });
  router.post('/:id/recheck', async (req, res) => {
    const { identity } = await sessions.require(req, true);
    verified(identity);
    const _id = bookId(req.params.id);
    const book = await repo.books().findOne({ _id, author: identity.user.id });
    assert(book?.completedAt, 404, 'Book not found.');
    assert(['unverified', 'rejected'].includes(book.status), 409, 'This document does not need another check.');
    const since = Math.max(book.lastRecheckAt?.getTime() ?? 0, book.moderation?.checkedAt.getTime() ?? 0);
    assert(Date.now() - since >= 60000, 429, 'Wait one minute before requesting another check.');
    assert(await repo.rateLimit(identity.user.id, 'screening'), 429, 'Too many submissions. Try again in an hour.');
    const updated = await repo.books().findOneAndUpdate({ _id, author: identity.user.id, status: book.status,
      lastRecheckAt: book.lastRecheckAt ?? { $exists: false } },
      { $set: { status: 'pending', lastRecheckAt: new Date(), job: { readyAt: new Date(), attempts: 0, uncertainChecks: 0 } } },
      { returnDocument: 'after' });
    assert(updated, 409, 'A check has already started.');
    res.json({ book: summary(updated, true) });
  });
  return router;
}
