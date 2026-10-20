import type { Repository } from '../models/database.js';

export async function cleanAbandonedUploads(repo: Repository, removeIncoming: (key: string) => Promise<void>,
  now = Date.now, deadline = now() + 40000) {
  const cutoff = new Date(now() - 7 * 86400000);
  const eligible = { completedAt: { $exists: false }, object: { $exists: false },
    incomingCleanedAt: { $exists: false }, uploadExpiresAt: { $lt: cutoff } };
  const books = await repo.books().find(eligible).sort({ uploadExpiresAt: 1 }).limit(20).toArray();
  let removed = 0;
  for (const book of books) {
    if (deadline - now() < 30000) break;
    if (!/^incoming\/[a-f0-9-]{36}\.pdf$/.test(book.stagingKey)) continue;
    if (!await repo.books().findOne({ ...eligible, _id: book._id })) continue;
    await removeIncoming(book.stagingKey);
    await repo.books().updateOne({ ...eligible, _id: book._id }, { $set: { incomingCleanedAt: new Date(now()) } });
    removed++;
  }
  return { removed };
}
