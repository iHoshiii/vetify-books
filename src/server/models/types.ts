import type { ObjectId } from 'mongodb';
import type { BookStatus } from '../../shared/books.js';
import type { BookScreenResult } from '../services/book-screening.service.js';

export type StoredObject = { key: string; version: string; size: number };
export type BookDocument = {
  _id: ObjectId;
  author: string;
  uploadedBy: string;
  title: string;
  description: string;
  topic: string;
  size: number;
  createdAt: Date;
  status: BookStatus;
  declaredHash: string;
  contentHash?: string;
  stagingKey: string;
  object?: StoredObject;
  uploadExpiresAt: Date;
  completedAt?: Date;
  incomingCleanedAt?: Date;
  moderation?: BookScreenResult & { checkedAt: Date };
  job?: {
    readyAt: Date;
    attempts: number;
    uncertainChecks: number;
    leaseUntil?: Date;
    token?: string;
    exhausted?: boolean;
  };
  lastRecheckAt?: Date;
};
export type Quota = {
  _id: string;
  used: number;
  author?: string;
  bookId?: ObjectId;
  month?: string;
  earningsCentavos?: number;
  paidDownloads?: number;
  requests?: string[];
  downloads?: { id: ObjectId; at: Date; earningsCentavos: number }[];
};
export type Session = { _id: string; encryptedToken: string; expiresAt: Date; csrf: string };
export type Login = { _id: string; state: string; verifier: string; nonce: string; returnTo?: string; expiresAt: Date };
export type SavedBook = { _id: string; userId: string; bookId: ObjectId; createdAt: Date };
