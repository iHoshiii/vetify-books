import type { Document } from 'mongodb';
import { z } from 'zod';
import { BOOK_TOPICS } from '../../shared/books.js';
import type { Repository } from './database.js';
import type { BookDocument } from './types.js';
import { pagination, summary } from '../routes/schemas.js';

export const libraryQuery = pagination.extend({
  q: z.string().trim().max(100).default(''),
  topic: z.enum(BOOK_TOPICS).optional(),
  saved: z.enum(['true', 'false']).default('false'),
}).strict();
export async function libraryPage(repo: Repository, userId: string, mine: boolean, query: z.infer<typeof libraryQuery>) {
  const filter: Document = mine ? { author: userId } : { status: 'approved' };
  if (query.q) filter.title = { $regex: query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
  if (query.topic) filter.topic = query.topic;
  const pipeline: Document[] = [
    { $match: filter },
    { $lookup: { from: 'books_saved', let: { bookId: '$_id' }, pipeline: [
      { $match: { userId, $expr: { $eq: ['$bookId', '$$bookId'] } } }, { $limit: 1 },
    ], as: 'savedEntries' } },
    { $set: { saved: { $gt: [{ $size: '$savedEntries' }, 0] } } },
  ];
  if (query.saved === 'true') pipeline.push({ $match: { saved: true } });
  pipeline.push({ $facet: {
    items: [{ $sort: { createdAt: -1, _id: -1 } }, { $skip: (query.page - 1) * 12 }, { $limit: 12 }],
    counts: [{ $count: 'total' }],
  } });
  const [result] = await repo.books().aggregate<{ items: (BookDocument & { saved: boolean })[]; counts: { total: number }[] }>(pipeline).toArray();
  const total = result?.counts[0]?.total ?? 0;
  return { items: (result?.items ?? []).map(book => ({ ...summary(book, mine), saved: book.saved })),
    total, page: query.page, pages: Math.max(1, Math.ceil(total / 12)) };
}
