import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { routeFixture } from '../../test-utils/routes.js';
import { makeBook, identity, pdf } from '../../test-utils/fixtures.js';
import { bookMonth, recordBookCommission } from '../../models/commissions.js';

const { state: s, get, post } = routeFixture();
async function published() {
  const book = makeBook();
  s.storage.objects.set(book.stagingKey, pdf);
  book.object = await s.storage.head(book.stagingKey);
  book.status = 'approved';
  await s.repo.books().insertOne(book);
  return book;
}
describe('Authorized downloads and commission slots', () => {
  it('caps concurrent eligible credits at three and still grants every download', async () => {
    const book = await published();
    s.auth.current = identity('main-reader', 'user');
    const results = await Promise.all(Array.from({ length: 20 }, () => post(`/books/${book._id}/download`)
      .set('Idempotency-Key', crypto.randomUUID())));
    expect(results.every((result) => result.status === 200 && result.body.url.includes('v='))).toBe(true);
    const quota = (await s.repo.quotas().findOne())!;
    expect(quota.used).toBe(3); expect(quota.paidDownloads).toBe(3); expect(quota.earningsCentavos).toBe(600);
    expect((await get(`/books/${book._id}/allowance`)).body.remaining).toBe(0);
  });
  it('does not double-credit repeated request IDs', async () => {
    const book = await published(); s.auth.current = identity('main-reader', 'user');
    const key = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 10 }, () => post(`/books/${book._id}/download`).set('Idempotency-Key', key)));
    expect(results.every((result) => result.status === 200)).toBe(true);
    const quota = (await s.repo.quotas().findOne())!;
    expect(quota.used).toBe(1); expect(quota.earningsCentavos).toBe(200); expect(quota.downloads).toHaveLength(1);
  });
  it('self-downloads consume slots but earn zero and do not appear as credited activity', async () => {
    const book = await published();
    for (let index = 0; index < 4; index++) expect((await post(`/books/${book._id}/download`).set('Idempotency-Key', crypto.randomUUID())).status).toBe(200);
    const quota = (await s.repo.quotas().findOne())!;
    expect(quota.used).toBe(3); expect(quota.earningsCentavos).toBe(0); expect(quota.paidDownloads).toBe(0);
    const affiliate = await get('/books/affiliate');
    expect(affiliate.body.downloads).toBe(0); expect(affiliate.body.daily).toHaveLength(30);
  });
  it('only shows the current professional ledger and preserves real chart totals', async () => {
    const book = await published(); s.auth.current = identity('reader', 'user');
    await post(`/books/${book._id}/download`).set('Idempotency-Key', crypto.randomUUID());
    expect((await get('/books/affiliate')).status).toBe(403);
    s.auth.current = identity();
    const affiliate = (await get('/books/affiliate')).body;
    expect(affiliate.earningsCentavos).toBe(200); expect(affiliate.downloads).toBe(1);
    expect(affiliate.topBooks[0].title).toBe(book.title);
    expect(affiliate.daily.reduce((sum: number, row: { earningsCentavos: number }) => sum + row.earningsCentavos, 0)).toBe(200);
    s.auth.current = identity('another-author');
    expect((await get('/books/affiliate')).body.earningsCentavos).toBe(0);
  });
  it('knowing an object key cannot grant an unauthorized download URL', async () => {
    const book = await published();
    expect((await request(s.app).post(`/api/v1/books/${book._id}/download`)).status).toBe(401);
    expect((await get(`/storage/download/${book.stagingKey}`)).status).toBe(404);
    expect((await post(`/books/${book._id}/download`)).status).toBe(400);
    expect((await request(s.app).post(`/api/v1/books/${book._id}/download`).set('Cookie', s.cookie)
      .set('Origin', 'https://attacker.invalid').set('X-CSRF-Token', s.csrf)).status).toBe(403);
    expect((await request(s.app).post(`/api/v1/books/${book._id}/download`).set('Cookie', s.cookie)
      .set('Origin', 'http://localhost:5175')).status).toBe(403);
  });
  it('uses Singapore month boundaries', () => {
    expect(bookMonth(new Date('2026-10-31T15:59:59Z')).key).toBe('2026-10');
    expect(bookMonth(new Date('2026-10-31T16:00:00Z'))).toEqual({ key: '2026-11', resetsAt: '2026-11-30T16:00:00.000Z' });
  });
  it('keeps distinct book and calendar-month earning slots independent', async () => {
    const first = await published(); const second = await published();
    for (let index = 0; index < 4; index++) await recordBookCommission(s.repo, 'reader', first._id, first.author,
      crypto.randomUUID(), new Date('2026-10-31T15:59:59Z'));
    await recordBookCommission(s.repo, 'reader', first._id, first.author, crypto.randomUUID(), new Date('2026-10-31T16:00:00Z'));
    await recordBookCommission(s.repo, 'reader', second._id, second.author, crypto.randomUUID(), new Date('2026-10-31T15:59:59Z'));
    const quotas = await s.repo.quotas().find().toArray();
    expect(quotas).toHaveLength(3);
    expect(quotas.reduce((sum, row) => sum + (row.earningsCentavos ?? 0), 0)).toBe(1000);
  });
});
