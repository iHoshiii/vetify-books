import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { BOOK_MAX_BYTES, BOOK_TOPICS } from '../../shared/books.js';
import { assert } from '../errors.js';
import type { BookDocument } from '../models/types.js';

export const pagination = z.object({ page: z.coerce.number().int().min(1).max(10000).default(1) });
export const uploadSchema = z.object({
  title: z.string().trim().min(3).max(150), description: z.string().trim().min(10).max(1000),
  topic: z.enum(BOOK_TOPICS), veterinaryOnly: z.literal(true),
  size: z.number().int().positive().max(BOOK_MAX_BYTES), sha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export function bookId(value: unknown) {
  assert(typeof value === 'string' && /^[a-fA-F0-9]{24}$/.test(value), 404, 'Book not found.');
  return new ObjectId(value);
}
export function summary(book: BookDocument, privateView = false) {
  return { id: book._id.toHexString(), title: book.title, description: book.description, topic: book.topic,
    uploadedBy: book.uploadedBy, size: book.size, createdAt: book.createdAt.toISOString(),
    ...(privateView ? { status: book.status, reason: book.moderation?.reason ?? null,
      uploadComplete: !!book.completedAt, submittedAt: book.completedAt?.toISOString(),
      reviewedAt: book.moderation?.checkedAt.toISOString() } : {}) };
}
