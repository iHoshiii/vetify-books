import { describe, it, expect } from 'vitest';
import { routeFixture } from '../../test-utils/routes.js';
import { input, identity, pdf, makeBook, approved } from '../../test-utils/fixtures.js';
import { ReviewService } from '../../services/review.js';

const { state: s, get, post } = routeFixture();
describe('Private upload authorization and validation', () => {
  it('denies ordinary users and admins and never accepts an author override', async () => {
    for (const role of ['user', 'admin'] as const) {
      s.auth.current = identity('main-reader', role);
      expect((await post('/books/uploads', input)).status).toBe(403);
    }
    s.auth.current = identity();
    expect((await post('/books/uploads', { ...input, author: 'another-main-id' })).status).toBe(400);
    expect(await s.repo.books().countDocuments()).toBe(0);
  });
  it('denies unapproved and revoked professionals', async () => {
    for (const status of ['pending', 'revoked'] as const) {
      s.auth.current.professional = { status };
      expect((await post('/books/uploads', input)).status).toBe(403);
    }
    delete s.auth.current.professional;
    expect((await post('/books/uploads', input)).status).toBe(403);
  });
  it('queues a verified upload, pins storage, and keeps it private until approved', async () => {
    const created = await post('/books/uploads', input);
    expect(created.status).toBe(201);
    const book = (await s.repo.books().findOne())!;
    expect(book.author).toBe('main-professional');
    expect((await get('/books')).body.items).toEqual([]);
    expect((await post(`/books/${book._id}/complete`)).status).toBe(409);
    s.storage.objects.set(book.stagingKey, pdf);
    const complete = await post(`/books/${book._id}/complete`);
    expect(complete.body.book.status).toBe('pending');
    expect((await post(`/books/${book._id}/complete`)).status).toBe(200);
    expect((await get('/books/mine')).body.items[0].uploadComplete).toBe(true);
    expect((await post(`/books/${book._id}/download`).set('Idempotency-Key', crypto.randomUUID())).status).toBe(404);
    const review = new ReviewService(s.repo, s.storage, s.auth, async () => approved);
    expect(await review.processOne()).toBe(true);
    expect((await get('/books')).body.items).toHaveLength(1);
    const saved = (await s.repo.books().findOne())!;
    expect(saved.object?.version).toBe(input.sha256);
    expect(saved.object?.key).toMatch(/^documents\//);
    expect(saved.contentHash).toBe(input.sha256);
    expect((await post('/books/uploads', input)).status).toBe(409);
  });
  it('blocks cross-author completion, private views, and recheck', async () => {
    const book = makeBook('another-main-id');
    await s.repo.books().insertOne(book);
    expect((await post(`/books/${book._id}/complete`)).status).toBe(404);
    expect((await post(`/books/${book._id}/recheck`)).status).toBe(404);
    expect((await get('/books/mine')).body.items).toEqual([]);
  });
  it('rechecks current approval on completion and denies disabled accounts', async () => {
    const created = await post('/books/uploads', input);
    s.auth.current.professional = { status: 'revoked' };
    expect((await post(`/books/${created.body.book.id}/complete`)).status).toBe(403);
    s.auth.disabled = true;
    expect((await get('/books')).status).toBe(401);
    expect((await post('/books/uploads', input)).status).toBe(401);
  });
  it('rejects oversized, invalid metadata, incomplete and size-mismatched objects', async () => {
    expect((await post('/books/uploads', { ...input, size: 10485761 })).status).toBe(400);
    expect((await post('/books/uploads', { ...input, veterinaryOnly: false })).status).toBe(400);
    expect((await post('/books/uploads', { ...input, sha256: 'fake' })).status).toBe(400);
    const created = await post('/books/uploads', input);
    const book = (await s.repo.books().findOne())!;
    s.storage.objects.set(book.stagingKey, Buffer.from('invalid'));
    expect((await post(`/books/${created.body.book.id}/complete`)).status).toBe(400);
  });
  it('uses a persistent submission limit shared by upload and recheck', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => post('/books/uploads', input)));
    expect(results.filter((result) => result.status === 201)).toHaveLength(10);
    expect(results.filter((result) => result.status === 429)).toHaveLength(2);
  });
  it('rechecks only after cooldown and preserves the existing book and commission record', async () => {
    const book = makeBook(); book.status = 'unverified'; book.completedAt = new Date();
    book.moderation = { ...approved, checkedAt: new Date() };
    await s.repo.books().insertOne(book);
    const quotaId = `reader:${book._id}:2026-10`;
    await s.repo.quotas().insertOne({ _id: quotaId, used: 3, earningsCentavos: 600, paidDownloads: 3 });
    expect((await post(`/books/${book._id}/recheck`)).status).toBe(429);
    await s.repo.books().updateOne({ _id: book._id }, { $set: { 'moderation.checkedAt': new Date(Date.now() - 61000) } });
    const results = await Promise.all([post(`/books/${book._id}/recheck`), post(`/books/${book._id}/recheck`)]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(await s.repo.books().countDocuments()).toBe(1);
    expect((await s.repo.quotas().findOne({ _id: quotaId }))?.earningsCentavos).toBe(600);
    expect((await s.repo.books().findOne())?.status).toBe('pending');
  });
});
