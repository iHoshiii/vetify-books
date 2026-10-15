import type { BookStatus } from '../../shared/books.js';
import type { BookDocument, StoredObject } from '../models/types.js';
import type { BookScreenResult } from '../services/book-screening.service.js';

export type JobLease = { book: BookDocument; token: string };
export type JobCompletion = {
  status: BookStatus;
  moderation: BookScreenResult & { checkedAt: Date };
  retry: boolean;
  uncertainChecks: number;
  readyAt: Date;
  object?: StoredObject;
};
export interface DurableJobAdapter {
  claim(now: Date): Promise<JobLease | null>;
  complete(lease: JobLease, result: JobCompletion): Promise<void>;
  recoverExhausted(now: Date): Promise<void>;
}
