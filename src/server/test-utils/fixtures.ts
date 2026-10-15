import { createHash, randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { loadConfig } from '../config/env.js';
import type { AuthAdapter, Identity } from '../auth/main-auth.js';
import type { StorageAdapter, UploadGrant } from '../storage/types.js';
import type { StoredObject, BookDocument } from '../models/types.js';
import { AppError } from '../errors.js';
import { makeBookPdf } from './book-pdf.js';

export const config = loadConfig({ NODE_ENV: 'test', MONGODB_URI: 'mongodb://127.0.0.1:27017/vetify_books',
  LOCAL_STORAGE_SECRET: 'offline-local-storage-secret-32-chars', SESSION_ENCRYPTION_KEY: 'a'.repeat(64) });
export function identity(id = 'main-professional', role: Identity['user']['role'] = 'professional'): Identity {
  return { version: 2, issuer: config.MAIN_AUTH_ORIGIN, audience: config.AUTH_CLIENT_ID,
    user: { id, name: 'Dr. Rivera', role, status: 'active' }, emailVerified: true, sessionActive: true,
    providers: ['google', 'password'], professional: { status: 'verified' },
    tokenExpiresAt: new Date(Date.now() + 3600000).toISOString(), validUntil: new Date(Date.now() + 30000).toISOString() };
}
export class FakeAuth implements AuthAdapter {
  current = identity();
  disabled = false;
  unavailable = false;
  async introspect() {
    if (this.disabled) throw new AppError(401, 'Account is disabled.');
    if (this.unavailable) throw new AppError(503, 'Main is unavailable.');
    return this.current;
  }
  async capability(id: string) {
    const value = await this.introspect();
    return { ...value, user: { ...value.user, id } };
  }
  async authorizationUrl(state: string, verifier: string) {
    return `${config.MAIN_AUTH_ORIGIN}/api/v1/auth/authorize?state=${state}&challenge=${verifier}`;
  }
  async exchange(callback: URL, state: string, verifier: string) {
    if (callback.searchParams.get('state') !== state || !callback.searchParams.get('code') || !verifier)
      throw new AppError(401, 'Invalid code.');
    return { token: 'main-test-token', expiresIn: 3600 };
  }
}
export class MemoryStorage implements StorageAdapter {
  objects = new Map<string, Buffer>();
  async upload(key: string): Promise<UploadGrant> { return { url: `https://storage.invalid/${key}`, method: 'PUT', expiresIn: 300 }; }
  async head(key: string): Promise<StoredObject> {
    const data = this.objects.get(key);
    if (!data) throw new AppError(409, 'Upload missing.');
    return { key, size: data.length, version: createHash('sha256').update(data).digest('hex') };
  }
  async read(object: StoredObject) {
    const data = this.objects.get(object.key)!;
    if (createHash('sha256').update(data).digest('hex') !== object.version) throw new AppError(400, 'Integrity failure.');
    return data;
  }
  async download(object: StoredObject, filename: string) { return `https://storage.invalid/${object.key}?v=${object.version}&filename=${filename}`; }
  private async copy(object: StoredObject, prefix: string) {
    const bytes = await this.read(object);
    const key = `${prefix}/${object.key.split('/').at(-1)}`;
    this.objects.set(key, bytes);
    return { ...object, key };
  }
  quarantine(object: StoredObject) { return this.copy(object, 'quarantine'); }
  publish(object: StoredObject) { return this.copy(object, 'documents'); }
}
export const pdf = makeBookPdf([['Veterinary article', 'Animal welfare includes responsible care and nutrition.']]);
export const sha256 = createHash('sha256').update(pdf).digest('hex');
export const input = { title: 'Veterinary article', description: 'Original animal welfare education.', topic: 'Animal welfare',
  veterinaryOnly: true, size: pdf.length, sha256 };
export function makeBook(author = 'main-professional', hash = sha256): BookDocument {
  return { _id: new ObjectId(), author, uploadedBy: 'Dr. Rivera', title: input.title, description: input.description,
    topic: input.topic, size: pdf.length, declaredHash: hash, stagingKey: `quarantine/${randomUUID()}.pdf`,
    createdAt: new Date(), status: 'pending', uploadExpiresAt: new Date(Date.now() + 300000) };
}
export const approved = { outcome: 'approved' as const, reason: 'Veterinary education.', model: 'offline',
  rulesVersion: 'vet-relevance-v1', evidence: [{ page: 1, excerpt: 'Animal welfare includes responsible care and nutrition.' }],
  topics: ['Animal welfare'], documentType: 'article' };
