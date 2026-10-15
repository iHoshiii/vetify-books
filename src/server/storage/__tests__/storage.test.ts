import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalStorage } from '../local.js';
import { disposition } from '../types.js';
import { pdf } from '../../test-utils/fixtures.js';

describe('Private immutable object storage', () => {
  it('authorizes local transfers, rejects tampering and prevents file replacement', async () => {
    const cache = resolve('.cache'); await mkdir(cache, { recursive: true });
    const directory = await mkdtemp(resolve(cache, 'storage-test-'));
    try {
      const storage = new LocalStorage(directory, 's'.repeat(32), 'http://localhost:5175');
      const key = `quarantine/${randomUUID()}.pdf`;
      const grant = await storage.upload(key, pdf.length);
      const ticket = grant.url.split('/').at(-1)!;
      await expect(storage.accept(ticket, Buffer.from('wrong-size'))).rejects.toMatchObject({ status: 400 });
      await storage.accept(ticket, pdf);
      await expect(storage.accept(ticket, pdf)).rejects.toMatchObject({ status: 409 });
      const object = await storage.head(key);
      const download = await storage.download(object, 'animal-welfare.pdf');
      expect((await storage.fetchDownload(download.split('/').at(-1)!)).bytes).toEqual(pdf);
      expect(() => storage.verify(`${ticket}x`, 'upload')).toThrow();
      expect(() => storage.verify(ticket, 'download')).toThrow();
      await expect(storage.upload('../../escape.pdf', 10)).rejects.toMatchObject({ status: 400 });
      await expect(storage.read({ ...object, version: '0'.repeat(64) })).rejects.toMatchObject({ status: 400 });
    } finally {
      if (!directory.startsWith(`${cache}${sep}`)) throw new Error('Test cleanup target escaped .cache.');
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('sanitizes Content-Disposition filenames', () => {
    expect(disposition('A\r\nX-Header: bad/../book')).toBe('AX-Header badbook.pdf');
    expect(disposition('')).toBe('veterinary-book.pdf');
  });
});
