import { createHash } from 'node:crypto';
import * as blob from '@vercel/blob';
import { BOOK_MAX_BYTES } from '../../shared/books.js';
import { AppError, assert } from '../errors.js';
import type { StoredObject } from '../models/types.js';
import type { StorageAdapter, UploadGrant } from './types.js';

export class VercelBlobStorage implements StorageAdapter {
  constructor(private storeId: string, private token?: string) {}
  private options() { return { storeId: this.storeId, token: this.token, abortSignal: AbortSignal.timeout(20000) }; }
  private path(key: string) {
    assert(/^(incoming|quarantine)\/[a-f0-9-]{36}\.pdf$/.test(key) ||
      /^documents\/[a-f0-9-]{36}\/[a-zA-Z0-9 -]+\.pdf$/.test(key), 400, 'Invalid storage object.');
    return key;
  }
  async upload(key: string, size: number): Promise<UploadGrant> {
    assert(this.path(key).startsWith('incoming/'), 400, 'Upload must use a new incoming object.');
    assert(size > 0 && size <= BOOK_MAX_BYTES, 413, 'PDF must be at most 10 MB.');
    const validUntil = Date.now() + 300000;
    const signed = await blob.issueSignedToken({ ...this.options(), pathname: key, operations: ['put'],
      validUntil, allowedContentTypes: ['application/pdf'], maximumSizeInBytes: size });
    const { presignedUrl } = await blob.presignUrl(signed, { access: 'private', operation: 'put', pathname: key,
      validUntil, allowedContentTypes: ['application/pdf'], maximumSizeInBytes: size,
      allowOverwrite: false, addRandomSuffix: false, cacheControlMaxAge: 60 });
    return { url: presignedUrl, method: 'PUT', expiresIn: 300 };
  }
  async removeIncoming(key: string) {
    assert(this.path(key).startsWith('incoming/'), 400, 'Retention can only remove abandoned incoming uploads.');
    await blob.del(key, this.options());
  }
  async head(key: string): Promise<StoredObject> {
    try {
      const info = await blob.head(this.path(key), this.options());
      assert(new URL(info.url).hostname.endsWith('.private.blob.vercel-storage.com'), 503, 'Books requires a private Vercel Blob store.');
      assert(info.pathname === key && info.etag, 400, 'Stored PDF identity could not be verified.');
      assert(info.contentType === 'application/pdf', 400, 'Upload must be a PDF.');
      assert(info.size > 0 && info.size <= BOOK_MAX_BYTES, 413, 'PDF is empty or exceeds 10 MB.');
      return { key, size: info.size, version: info.etag };
    } catch (error) {
      if (error instanceof blob.BlobNotFoundError) throw new AppError(409, 'Upload the PDF before completing the submission.');
      throw error;
    }
  }
  async read(object: StoredObject) {
    const result = await blob.get(this.path(object.key), { ...this.options(), access: 'private', useCache: false });
    assert(result?.statusCode === 200 && result.blob.etag === object.version && result.blob.size === object.size,
      400, 'Stored PDF changed or is unavailable.');
    assert(object.size <= BOOK_MAX_BYTES, 413, 'PDF exceeds 10 MB.');
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.length;
        assert(size <= object.size && size <= BOOK_MAX_BYTES, 413, 'PDF exceeds its declared size.');
        chunks.push(next.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    assert(size === object.size, 400, 'Stored PDF is incomplete.');
    return Buffer.concat(chunks);
  }
  private async save(key: string, bytes: Buffer): Promise<StoredObject> {
    this.path(key);
    try {
      await blob.put(key, bytes, { ...this.options(), access: 'private', allowOverwrite: false,
        addRandomSuffix: false, contentType: 'application/pdf', cacheControlMaxAge: 60 });
    } catch (error) {
      const existing = await this.head(key).catch(() => null);
      if (!existing) throw error;
      const current = await this.read(existing);
      assert(createHash('sha256').update(current).digest('hex') === createHash('sha256').update(bytes).digest('hex'),
        409, 'An existing document cannot be replaced.');
      return existing;
    }
    return this.head(key);
  }
  async quarantine(object: StoredObject) {
    const bytes = await this.read(object);
    return this.save(`quarantine/${object.key.split('/').at(-1)}`, bytes);
  }
  async publish(object: StoredObject, filename: string, validatedBytes: Buffer) {
    assert(/^[a-zA-Z0-9 -]+\.pdf$/.test(filename), 400, 'Invalid document filename.');
    assert(validatedBytes.length === object.size, 400, 'Reviewed PDF size changed.');
    const id = object.key.split('/').at(-1)!.replace(/\.pdf$/, '');
    return this.save(`documents/${id}/${filename}`, validatedBytes);
  }
  async download(object: StoredObject, filename: string, inline = false) {
    const current = await this.head(object.key);
    assert(current.version === object.version && current.size === object.size, 400, 'Stored PDF integrity check failed.');
    assert(object.key.startsWith('documents/') && object.key.endsWith(`/${filename}`), 400, 'Invalid approved document reference.');
    const validUntil = Date.now() + 60000;
    const signed = await blob.issueSignedToken({ ...this.options(), pathname: object.key, operations: ['get'], validUntil });
    const { presignedUrl } = await blob.presignUrl(signed, { access: 'private', operation: 'get', pathname: object.key,
      validUntil, useCache: false });
    return inline ? presignedUrl : blob.getDownloadUrl(presignedUrl);
  }
  preview(object: StoredObject, filename: string) { return this.download(object, filename, true); }
}
