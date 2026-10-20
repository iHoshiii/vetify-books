import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { z } from 'zod';
import { BOOK_MAX_BYTES } from '../../shared/books.js';
import { AppError, assert } from '../errors.js';
import type { StoredObject } from '../models/types.js';
import type { StorageAdapter, UploadGrant } from './types.js';

const ticketSchema = z.object({ action: z.enum(['upload', 'download']), key: z.string(), expires: z.number(),
  size: z.number().optional(), filename: z.string().optional(), version: z.string().optional() });
export class LocalStorage implements StorageAdapter {
  constructor(private directory: string, private secret: string, private baseUrl: string) {}
  private path(key: string) {
    assert(/^(incoming|quarantine|documents)\/[a-f0-9-]{36}\.pdf$/.test(key), 400, 'Invalid storage object.');
    return resolve(this.directory, key);
  }
  private sign(payload: z.infer<typeof ticketSchema>) {
    const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret).update(value).digest('base64url');
    return `${value}.${signature}`;
  }
  verify(ticket: string, action: 'upload' | 'download') {
    assert(ticket.length < 2048, 403, 'Storage link is invalid.');
    const [value, signature, extra] = ticket.split('.');
    assert(value && signature && !extra, 403, 'Storage link is invalid.');
    const expected = createHmac('sha256', this.secret).update(value).digest();
    const actual = Buffer.from(signature, 'base64url');
    assert(actual.length === expected.length && timingSafeEqual(actual, expected), 403, 'Storage link is invalid.');
    let payload: z.infer<typeof ticketSchema>;
    try { payload = ticketSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString())); }
    catch { throw new AppError(403, 'Storage link is invalid.'); }
    assert(payload.action === action && payload.expires > Date.now(), 403, 'Storage link has expired.');
    this.path(payload.key);
    return payload;
  }
  async upload(key: string, size: number): Promise<UploadGrant> {
    this.path(key);
    const ticket = this.sign({ action: 'upload', key, size, expires: Date.now() + 300000 });
    return { url: `${this.baseUrl}/api/v1/storage/upload/${ticket}`, method: 'PUT', expiresIn: 300 };
  }
  async accept(ticket: string, bytes: Buffer) {
    const payload = this.verify(ticket, 'upload');
    assert(bytes.length === payload.size && bytes.length <= BOOK_MAX_BYTES, 400, 'PDF size does not match the declared upload.');
    await mkdir(dirname(this.path(payload.key)), { recursive: true });
    try { await writeFile(this.path(payload.key), bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      throw new AppError(409, 'This upload has already been stored.');
    }
  }
  async head(key: string): Promise<StoredObject> {
    try {
      const info = await stat(this.path(key));
      assert(info.size > 0 && info.size <= BOOK_MAX_BYTES, 413, 'PDF is empty or exceeds 10 MB.');
      const bytes = await readFile(this.path(key));
      return { key, size: info.size, version: createHash('sha256').update(bytes).digest('hex') };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new AppError(409, 'Upload the PDF before completing the submission.');
      throw error;
    }
  }
  async read(object: StoredObject) {
    const info = await stat(this.path(object.key));
    assert(info.size === object.size && info.size <= BOOK_MAX_BYTES, 400, 'Stored PDF size changed.');
    const bytes = await readFile(this.path(object.key));
    assert(createHash('sha256').update(bytes).digest('hex') === object.version, 400, 'Stored PDF integrity check failed.');
    return bytes;
  }
  async download(object: StoredObject, filename: string) {
    const ticket = this.sign({ action: 'download', key: object.key, version: object.version, size: object.size,
      filename, expires: Date.now() + 60000 });
    return `${this.baseUrl}/api/v1/storage/download/${ticket}`;
  }
  private async copy(object: StoredObject, prefix: 'quarantine' | 'documents') {
    const bytes = await this.read(object);
    const key = `${prefix}/${object.key.split('/').at(-1)}`;
    await mkdir(dirname(this.path(key)), { recursive: true });
    try { await writeFile(this.path(key), bytes, { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const copied = await this.head(key);
    assert(copied.version === object.version, 400, 'Stored PDF integrity check failed.');
    return copied;
  }
  quarantine(object: StoredObject) { return this.copy(object, 'quarantine'); }
  publish(object: StoredObject) { return this.copy(object, 'documents'); }
  async fetchDownload(ticket: string) {
    const payload = this.verify(ticket, 'download');
    assert(payload.version && payload.size && payload.filename?.match(/^[a-zA-Z0-9 -]+\.pdf$/), 403, 'Invalid download link.');
    return { bytes: await this.read({ key: payload.key, version: payload.version, size: payload.size }), filename: payload.filename };
  }
}
