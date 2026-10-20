import type { StoredObject } from '../models/types.js';

export type UploadGrant = { url: string; method: 'PUT' | 'POST'; fields?: Record<string, string>; expiresIn: number };
export interface StorageAdapter {
  upload(key: string, size: number): Promise<UploadGrant>;
  head(key: string): Promise<StoredObject>;
  read(object: StoredObject): Promise<Buffer>;
  quarantine(object: StoredObject): Promise<StoredObject>;
  publish(object: StoredObject, filename: string, validatedBytes: Buffer): Promise<StoredObject>;
  download(object: StoredObject, filename: string): Promise<string>;
}
export function disposition(title: string) {
  return `${title.replace(/[^a-zA-Z0-9 -]/g, '').trim().slice(0, 100) || 'veterinary-book'}.pdf`;
}
