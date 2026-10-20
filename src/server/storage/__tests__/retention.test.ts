import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import { testDatabase } from '../../test-utils/database.js';
import { makeBook } from '../../test-utils/fixtures.js';
import { cleanAbandonedUploads } from '../retention.js';

let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => { db = await testDatabase(); });
afterAll(async () => { await db?.close(); });
it('removes only expired abandoned incoming files and preserves submitted documents and ledgers', async () => {
  const old = new Date(Date.now() - 8 * 86400000);
  const abandoned = { ...makeBook(), uploadExpiresAt: old };
  abandoned.stagingKey = `incoming/${crypto.randomUUID()}.pdf`;
  const submitted = { ...makeBook(), uploadExpiresAt: old, completedAt: old };
  const referenced = { ...makeBook(), uploadExpiresAt: old, object: { key: 'quarantine/private.pdf', version: 'etag', size: 12 } };
  const fresh = makeBook();
  const invalid = { ...makeBook(), uploadExpiresAt: old, stagingKey: 'documents/do-not-delete.pdf' };
  await db.repo.books().insertMany([abandoned, submitted, referenced, fresh, invalid]);
  await db.repo.quotas().insertOne({ _id: 'preserved-ledger', used: 3, earningsCentavos: 600 });
  const remove = vi.fn(async (_key: string) => {});
  expect(await cleanAbandonedUploads(db.repo, remove)).toEqual({ removed: 1 });
  expect(remove).toHaveBeenCalledExactlyOnceWith(abandoned.stagingKey);
  expect((await db.repo.books().findOne({ _id: abandoned._id }))?.incomingCleanedAt).toBeInstanceOf(Date);
  expect(await db.repo.books().countDocuments()).toBe(5);
  expect((await db.repo.quotas().findOne())?.earningsCentavos).toBe(600);
  expect(await cleanAbandonedUploads(db.repo, remove)).toEqual({ removed: 0 });
});
