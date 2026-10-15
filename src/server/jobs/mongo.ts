import { randomUUID } from 'node:crypto';
import type { Repository } from '../models/database.js';
import type { DurableJobAdapter, JobLease, JobCompletion } from './types.js';
import { BOOK_SCREENING_RULES_VERSION } from '../services/screening-policy.js';

export const MAX_ATTEMPTS = 6;
export class MongoJobs implements DurableJobAdapter {
  constructor(private repo: Repository) {}
  async claim(now: Date): Promise<JobLease | null> {
    const token = randomUUID();
    const book = await this.repo.books().findOneAndUpdate({
      status: { $in: ['pending', 'checking'] }, completedAt: { $exists: true },
      'job.readyAt': { $lte: now }, 'job.attempts': { $lt: MAX_ATTEMPTS }, 'job.exhausted': { $ne: true },
      $or: [{ 'job.leaseUntil': { $exists: false } }, { 'job.leaseUntil': { $lte: now } }],
    }, { $set: { status: 'checking', 'job.token': token, 'job.leaseUntil': new Date(now.getTime() + 180000) },
      $inc: { 'job.attempts': 1 } }, { returnDocument: 'after', sort: { createdAt: 1 } });
    return book ? { book, token } : null;
  }
  async complete({ book, token }: JobLease, result: JobCompletion) {
    await this.repo.books().updateOne({ _id: book._id, 'job.token': token, 'job.leaseUntil': { $gt: result.moderation.checkedAt } }, {
      $set: { status: result.status, moderation: result.moderation,
        ...(result.status === 'approved' ? { object: result.object } : {}),
        'job.uncertainChecks': result.uncertainChecks, 'job.exhausted': !result.retry, 'job.readyAt': result.readyAt },
      $unset: { 'job.token': '', 'job.leaseUntil': '' },
    });
  }
  async recoverExhausted(now: Date) {
    await this.repo.books().updateMany({ status: 'checking', 'job.attempts': { $gte: MAX_ATTEMPTS },
      'job.leaseUntil': { $lte: now } }, { $set: { status: 'unverified', 'job.exhausted': true,
        moderation: { outcome: 'unavailable', reason: 'Checking stopped after repeated worker failures. Request another check.',
          model: 'worker-recovery', rulesVersion: BOOK_SCREENING_RULES_VERSION, evidence: [], topics: [], documentType: 'other', checkedAt: now } },
      $unset: { 'job.token': '', 'job.leaseUntil': '' } });
  }
}
