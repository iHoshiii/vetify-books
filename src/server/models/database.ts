import { MongoClient, type Db } from 'mongodb';
import type { BookDocument, Quota, Session, Login } from './types.js';
import type { Config } from '../config/env.js';

export class Repository {
  constructor(public db: Db) {}
  books = () => this.db.collection<BookDocument>('books');
  quotas = () => this.db.collection<Quota>('book_download_quotas');
  sessions = () => this.db.collection<Session>('books_sessions');
  logins = () => this.db.collection<Login>('books_login_transactions');
  limits = () => this.db.collection<{ _id: string; count: number; expiresAt: Date }>('books_rate_limits');
  async initialize() {
    await Promise.all([
      this.books().createIndex({ contentHash: 1 }, { unique: true, partialFilterExpression: { contentHash: { $type: 'string' } } }),
      this.books().createIndex({ author: 1, createdAt: -1 }),
      this.books().createIndex({ status: 1, 'job.readyAt': 1, 'job.leaseUntil': 1 }),
      this.books().createIndex({ completedAt: 1, incomingCleanedAt: 1, uploadExpiresAt: 1 }),
      this.quotas().createIndex({ author: 1, month: 1 }),
      this.quotas().createIndex({ author: 1, bookId: 1 }),
      this.sessions().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.logins().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.limits().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);
  }
  async rateLimit(userId: string, action: string, limit = 10, windowMs = 3600000) {
    const window = Math.floor(Date.now() / windowMs);
    const _id = `${action}:${userId}:${window}`;
    try {
      const record = await this.limits().findOneAndUpdate(
        { _id }, { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * windowMs) } },
        { upsert: true, returnDocument: 'after' },
      );
      return record!.count <= limit;
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      const record = await this.limits().findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { returnDocument: 'after' });
      return !!record && record.count <= limit;
    }
  }
}
export async function connect(config: Config) {
  const client = new MongoClient(config.MONGODB_URI, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000,
    socketTimeoutMS: 10000, waitQueueTimeoutMS: 5000 });
  await client.connect();
  const repo = new Repository(client.db(config.MONGODB_DATABASE));
  await repo.initialize();
  return { client, repo };
}
