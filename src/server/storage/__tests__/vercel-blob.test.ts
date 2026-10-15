import { beforeEach, it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import * as blob from '@vercel/blob';
import { VercelBlobStorage } from '../vercel-blob.js';
import { pdf } from '../../test-utils/fixtures.js';

vi.mock('@vercel/blob', async (original) => ({ ...await original<typeof blob>(),
  head: vi.fn(), get: vi.fn(), put: vi.fn(), del: vi.fn(), issueSignedToken: vi.fn(), presignUrl: vi.fn() }));
const storage = new VercelBlobStorage('test-private-store', 'offline-token');
const id = randomUUID();
const incoming = `incoming/${id}.pdf`;
const quarantine = `quarantine/${id}.pdf`;
const published = `documents/${id}/animal-welfare.pdf`;
function info(key = incoming, extra = {}) {
  return { pathname: key, etag: 'reviewed-etag', size: pdf.length, contentType: 'application/pdf',
    url: `https://test.private.blob.vercel-storage.com/${key}`, ...extra };
}
function content(bytes = pdf, etag = 'reviewed-etag', size = bytes.length) {
  return { statusCode: 200, blob: { etag, size }, stream: new ReadableStream({ start(controller) {
    controller.enqueue(bytes); controller.close();
  } }) };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(blob.issueSignedToken).mockResolvedValue({ delegationToken: 'offline' } as never);
  vi.mocked(blob.presignUrl).mockResolvedValue({ presignedUrl: 'https://test.private.blob.vercel-storage.com/file?signature=offline' });
  vi.mocked(blob.head).mockResolvedValue(info() as never);
  vi.mocked(blob.get).mockImplementation(async () => content() as never);
});
it('limits upload grants to new private incoming PDFs with bounded size and expiry', async () => {
  const start = Date.now();
  expect((await storage.upload(incoming, pdf.length)).method).toBe('PUT');
  const delegated = vi.mocked(blob.issueSignedToken).mock.calls[0][0];
  expect(delegated).toMatchObject({ pathname: incoming, operations: ['put'], maximumSizeInBytes: pdf.length,
    allowedContentTypes: ['application/pdf'], storeId: 'test-private-store' });
  expect(delegated.validUntil! - start).toBeLessThanOrEqual(300010);
  expect(blob.presignUrl).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ access: 'private',
    pathname: incoming, allowOverwrite: false, addRandomSuffix: false, operation: 'put' }));
  await expect(storage.upload(published, pdf.length)).rejects.toMatchObject({ status: 400 });
  await expect(storage.upload(incoming, 10485761)).rejects.toMatchObject({ status: 413 });
});
it('rejects public stores, oversized PDFs and missing integrity metadata', async () => {
  for (const extra of [{ url: 'https://test.public.blob.vercel-storage.com/file' }, { etag: '' }, { size: 10485761 }]) {
    vi.mocked(blob.head).mockResolvedValueOnce(info(incoming, extra) as never);
    await expect(storage.head(incoming)).rejects.toThrow();
  }
  await expect(storage.head('../../secret.pdf')).rejects.toMatchObject({ status: 400 });
});
it('checks uncached bytes against the stored etag and size', async () => {
  const object = { key: quarantine, version: 'reviewed-etag', size: pdf.length };
  expect(await storage.read(object)).toEqual(pdf);
  expect(blob.get).toHaveBeenCalledWith(quarantine, expect.objectContaining({ access: 'private', useCache: false }));
  vi.mocked(blob.get).mockResolvedValueOnce(content(pdf, 'changed') as never);
  await expect(storage.read(object)).rejects.toMatchObject({ status: 400 });
  vi.mocked(blob.get).mockResolvedValueOnce(content(Buffer.from('short'), object.version, object.size) as never);
  await expect(storage.read(object)).rejects.toMatchObject({ status: 400 });
  vi.mocked(blob.get).mockResolvedValueOnce(content(Buffer.alloc(pdf.length + 1), object.version, object.size) as never);
  await expect(storage.read(object)).rejects.toMatchObject({ status: 413 });
});
it('publishes the reviewed snapshot without copying mutable source bytes', async () => {
  vi.mocked(blob.head).mockResolvedValueOnce(info(published) as never);
  expect(await storage.publish({ key: quarantine, version: 'reviewed-etag', size: pdf.length }, 'animal-welfare.pdf', pdf))
    .toMatchObject({ key: published, version: 'reviewed-etag' });
  expect(blob.get).not.toHaveBeenCalled();
  expect(blob.put).toHaveBeenCalledWith(published, pdf, expect.objectContaining({ access: 'private', allowOverwrite: false }));
});
it('accepts repeated immutable copies only when existing bytes match', async () => {
  vi.mocked(blob.put).mockRejectedValue(new Error('Already exists'));
  vi.mocked(blob.head).mockResolvedValue(info(quarantine) as never);
  await expect(storage.quarantine({ key: incoming, version: 'reviewed-etag', size: pdf.length })).resolves.toMatchObject({ key: quarantine });
  vi.mocked(blob.get).mockResolvedValueOnce(content() as never).mockResolvedValueOnce(content(Buffer.alloc(pdf.length)) as never);
  await expect(storage.quarantine({ key: incoming, version: 'reviewed-etag', size: pdf.length })).rejects.toMatchObject({ status: 409 });
});
it('issues short private GET grants only for approved unchanged document references', async () => {
  vi.mocked(blob.head).mockResolvedValue(info(published) as never);
  const object = { key: published, version: 'reviewed-etag', size: pdf.length };
  const start = Date.now();
  expect(new URL(await storage.download(object, 'animal-welfare.pdf')).searchParams.get('download')).toBe('1');
  const delegated = vi.mocked(blob.issueSignedToken).mock.calls[0][0];
  expect(delegated).toMatchObject({ pathname: published, operations: ['get'] });
  expect(delegated.validUntil! - start).toBeLessThanOrEqual(60010);
  await expect(storage.download({ ...object, version: 'changed' }, 'animal-welfare.pdf')).rejects.toThrow();
  await expect(storage.download(object, 'different.pdf')).rejects.toThrow();
});
it('restricts retention deletion to incoming paths', async () => {
  await storage.removeIncoming(incoming);
  expect(blob.del).toHaveBeenCalledWith(incoming, expect.objectContaining({ storeId: 'test-private-store' }));
  await expect(storage.removeIncoming(quarantine)).rejects.toThrow();
  await expect(storage.removeIncoming(published)).rejects.toThrow();
  expect(blob.del).toHaveBeenCalledTimes(1);
});
