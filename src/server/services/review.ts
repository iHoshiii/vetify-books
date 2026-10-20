import { createHash } from 'node:crypto';
import type { Repository } from '../models/database.js';
import type { AuthAdapter } from '../auth/main-auth.js';
import { verified } from '../auth/main-auth.js';
import type { StorageAdapter } from '../storage/types.js';
import { disposition } from '../storage/types.js';
import { BOOK_MAX_BYTES, type BookStatus } from '../../shared/books.js';
import { AppError } from '../errors.js';
import { screenBook, BOOK_SCREENING_RULES_VERSION, type BookScreenResult } from './book-screening.service.js';
import { MongoJobs, MAX_ATTEMPTS } from '../jobs/mongo.js';
import type { DurableJobAdapter } from '../jobs/types.js';

export { MAX_ATTEMPTS };
const fallback = (outcome: BookScreenResult['outcome'], reason: string): BookScreenResult => ({
  outcome, reason, model: 'storage-validation', rulesVersion: BOOK_SCREENING_RULES_VERSION,
  evidence: [], topics: [], documentType: 'other',
});
export class ReviewService {
  constructor(private repo: Repository, private storage: StorageAdapter, private auth: AuthAdapter,
    private screen: typeof screenBook = screenBook, private jobs: DurableJobAdapter = new MongoJobs(repo), private daily = false) {}
  async processOne(now = new Date()): Promise<boolean> {
    const lease = await this.jobs.claim(now);
    if (!lease) return false;
    const { book, token } = lease;
    const filter = { _id: book._id, 'job.token': token, 'job.leaseUntil': { $gt: now } };
    let result: BookScreenResult;
    let publishedObject = book.object;
    try {
      verified(await this.auth.capability(book.author));
      if (!book.object) throw new AppError(400, 'Stored PDF is missing.');
      const bytes = await this.storage.read(book.object);
      if (bytes.length !== book.size || bytes.length > BOOK_MAX_BYTES || bytes.length < 8 ||
        bytes.subarray(0, 5).toString() !== '%PDF-' || !bytes.subarray(-1024).includes(Buffer.from('%%EOF')))
        throw new AppError(400, 'Upload a valid PDF of up to 10 MB.');
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== book.declaredHash) throw new AppError(400, 'PDF content hash does not match the declared file.');
      await this.repo.books().updateOne(filter, { $set: { contentHash: hash } });
      result = await this.screen(bytes);
      if (result.outcome === 'approved') {
        publishedObject = await this.storage.publish(book.object, disposition(book.title), bytes);
        verified(await this.auth.capability(book.author));
      }
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        result = fallback('rejected', 'An identical document has already been uploaded.');
      else if (error instanceof AppError && [400, 413].includes(error.status))
        result = fallback('rejected', error.message);
      else if (error instanceof AppError && [401, 403].includes(error.status))
        result = fallback('uncertain', 'A verified, active professional account is required to publish this document.');
      else result = fallback('unavailable', 'Checking is temporarily unavailable. We will try again.');
    }
    const uncertain = (book.job?.uncertainChecks ?? 0) + (result.outcome === 'uncertain' ? 1 : 0);
    const attempts = book.job?.attempts ?? 1;
    const retry = attempts < MAX_ATTEMPTS && (result.outcome === 'unavailable' || (result.outcome === 'uncertain' && uncertain < 2));
    const status: BookStatus = retry ? 'pending' : result.outcome === 'approved' || result.outcome === 'rejected' ? result.outcome : 'unverified';
    const finishedAt = new Date();
    const reason = result.outcome === 'unavailable' && !retry
      ? 'Checking is unavailable after repeated attempts. Request another check later.' : result.reason;
    const delay = result.outcome === 'uncertain' ? 15000 : Math.min(900000, 60000 * 2 ** (attempts - 1));
    const nextDaily = new Date(finishedAt); nextDaily.setUTCHours(18, 0, 0, 0);
    if (nextDaily <= finishedAt) nextDaily.setUTCDate(nextDaily.getUTCDate() + 1);
    await this.jobs.complete(lease, {
      status, moderation: { ...result, reason, checkedAt: finishedAt }, object: publishedObject,
      uncertainChecks: uncertain, retry, readyAt: this.daily ? nextDaily : new Date(finishedAt.getTime() + delay),
    });
    return true;
  }
  async recoverExhausted(now = new Date()) {
    await this.jobs.recoverExhausted(now);
  }
}
