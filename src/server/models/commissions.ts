import { ObjectId } from 'mongodb';
import { BOOK_AFFILIATE_CENTAVOS, BOOK_AFFILIATE_DOWNLOAD_LIMIT } from '../../shared/books.js';
import type { Repository } from './database.js';

export function bookMonth(now = new Date()) {
  const local = new Date(now.getTime() + 8 * 3600000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return { key: `${year}-${month + 1}`, resetsAt: new Date(Date.UTC(year, month + 1, 1) - 8 * 3600000).toISOString() };
}
export async function bookAllowance(repo: Repository, userId: string, bookId: string, now = new Date()) {
  const month = bookMonth(now);
  const quota = await repo.quotas().findOne({ _id: `${userId}:${bookId}:${month.key}` });
  const used = quota?.used ?? 0;
  return { used, remaining: Math.max(0, BOOK_AFFILIATE_DOWNLOAD_LIMIT - used), resetsAt: month.resetsAt };
}
export async function recordBookCommission(repo: Repository, userId: string, bookId: ObjectId, author: string,
  requestId: string, now = new Date()) {
  const month = bookMonth(now).key;
  const _id = `${userId}:${bookId}:${month}`;
  try { await repo.quotas().updateOne({ _id }, { $setOnInsert: { used: 0 } }, { upsert: true }); }
  catch (error) { if ((error as { code?: number }).code !== 11000) throw error; }
  const earningsCentavos = author !== userId ? BOOK_AFFILIATE_CENTAVOS : 0;
  return repo.quotas().findOneAndUpdate(
    { _id, used: { $lt: BOOK_AFFILIATE_DOWNLOAD_LIMIT }, requests: { $ne: requestId } },
    { $inc: { used: 1, earningsCentavos, paidDownloads: earningsCentavos > 0 ? 1 : 0 },
      $set: { author, bookId, month },
      $push: { requests: requestId, downloads: { id: new ObjectId(), at: now, earningsCentavos } } },
    { returnDocument: 'after' },
  );
}
