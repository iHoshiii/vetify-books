import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { testDatabase } from '../../test-utils/database.js';
import { MemoryStorage, FakeAuth, makeBook, pdf, approved } from '../../test-utils/fixtures.js';
import { ReviewService, MAX_ATTEMPTS } from '../review.js';

let db: Awaited<ReturnType<typeof testDatabase>>;
const storage = new MemoryStorage();
const auth = new FakeAuth();
beforeAll(async () => { db = await testDatabase(); });
beforeEach(async () => {
  await db.repo.books().deleteMany({}); await db.repo.quotas().deleteMany({});
  storage.objects.clear(); auth.disabled = false; auth.unavailable = false; auth.current.professional = { status: 'verified' };
});
afterAll(async () => { await db?.close(); });
async function queued(bytes = pdf) {
  const book = makeBook('main-professional', createHash('sha256').update(bytes).digest('hex'));
  book.size = bytes.length; storage.objects.set(book.stagingKey, bytes); book.object = await storage.head(book.stagingKey);
  book.completedAt = new Date(); book.job = { readyAt: new Date(), attempts: 0, uncertainChecks: 0 };
  await db.repo.books().insertOne(book);
  return book;
}
describe('Durable screening jobs', () => {
  it('defers production retries to the next daily cron instead of immediate reprocessing', async () => {
    const book = await queued();
    const worker = new ReviewService(db.repo, storage, auth, async () => ({ ...approved, outcome: 'unavailable' }), undefined, true);
    expect(await worker.processOne()).toBe(true);
    const result = await db.repo.books().findOne({ _id: book._id });
    expect(result?.status).toBe('pending');
    expect(result?.job?.readyAt.getUTCHours()).toBe(18);
    expect(result?.job?.readyAt.getUTCMinutes()).toBe(0);
    expect(result!.job!.readyAt.getTime()).toBeGreaterThan(Date.now());
    expect(await worker.processOne()).toBe(false);
  });
  it('serializes repeated deliveries and never records commissions while screening', async () => {
    await queued(); const screen = vi.fn(async () => approved);
    const workers = new ReviewService(db.repo, storage, auth, screen);
    await Promise.all(Array.from({ length: 6 }, () => workers.processOne()));
    expect(screen).toHaveBeenCalledOnce();
    expect((await db.repo.books().findOne())?.status).toBe('approved');
    expect(await db.repo.quotas().countDocuments()).toBe(0);
    expect(await workers.processOne()).toBe(false);
  });
  it('rejects simultaneous identical uploads using the unique actual hash', async () => {
    await queued(); await queued();
    const workers = new ReviewService(db.repo, storage, auth, async () => approved);
    await Promise.all([workers.processOne(), workers.processOne()]);
    expect(await db.repo.books().countDocuments({ status: 'approved' })).toBe(1);
    expect(await db.repo.books().countDocuments({ status: 'rejected' })).toBe(1);
  });
  it('rejects fake and oversized PDFs before model evaluation', async () => {
    const screen = vi.fn(async () => approved);
    const worker = new ReviewService(db.repo, storage, auth, screen);
    await queued(Buffer.from('not a PDF')); await worker.processOne();
    await queued(Buffer.alloc(10485761)); await worker.processOne();
    expect(screen).not.toHaveBeenCalled();
    expect(await db.repo.books().countDocuments({ status: 'rejected' })).toBe(2);
  });
  it('rejects an incorrect declared content hash', async () => {
    const book = await queued();
    await db.repo.books().updateOne({ _id: book._id }, { $set: { declaredHash: '0'.repeat(64) } });
    await new ReviewService(db.repo, storage, auth, async () => approved).processOne();
    expect((await db.repo.books().findOne())?.status).toBe('rejected');
  });
  it('keeps provider outages private and stops at the retry bound', async () => {
    const book = await queued();
    const worker = new ReviewService(db.repo, storage, auth, async () => ({ ...approved, outcome: 'unavailable' }));
    for (let index = 0; index < MAX_ATTEMPTS; index++) {
      await db.repo.books().updateOne({ _id: book._id }, { $set: { 'job.readyAt': new Date(0) } });
      expect(await worker.processOne()).toBe(true);
      expect((await db.repo.books().findOne())?.status).not.toBe('approved');
    }
    expect((await db.repo.books().findOne())?.status).toBe('unverified');
    expect(await worker.processOne()).toBe(false);
  });
  it('checks approval again after model evaluation', async () => {
    await queued();
    await new ReviewService(db.repo, storage, auth, async () => {
      auth.current.professional = { status: 'revoked' }; return approved;
    }).processOne();
    expect((await db.repo.books().findOne())?.status).not.toBe('approved');
  });
  it('recovers expired leases and fences a superseded worker', async () => {
    const book = await queued();
    await db.repo.books().updateOne({ _id: book._id }, { $set: { status: 'checking', 'job.token': 'old-token', 'job.leaseUntil': new Date(0) } });
    const worker = new ReviewService(db.repo, storage, auth, async () => {
      await db.repo.books().updateOne({ _id: book._id }, { $set: { 'job.token': 'new-owner-token' } }); return approved;
    });
    await worker.processOne();
    expect((await db.repo.books().findOne())?.status).toBe('checking');
    await db.repo.books().updateOne({ _id: book._id }, { $set: { 'job.attempts': MAX_ATTEMPTS, 'job.leaseUntil': new Date(0) } });
    await worker.recoverExhausted();
    expect((await db.repo.books().findOne())?.status).toBe('unverified');
  });
  it('holds uncertainty after two checks and keeps main outages private', async () => {
    const book = await queued();
    const worker = new ReviewService(db.repo, storage, auth, async () => ({ ...approved, outcome: 'uncertain' }));
    await worker.processOne();
    await db.repo.books().updateOne({ _id: book._id }, { $set: { 'job.readyAt': new Date(0) } });
    await worker.processOne(); expect((await db.repo.books().findOne())?.status).toBe('unverified');
    await db.repo.books().deleteMany({}); await queued(); auth.unavailable = true;
    await worker.processOne(); expect((await db.repo.books().findOne())?.status).toBe('pending');
  });
});
