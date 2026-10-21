import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { routeFixture } from '../../test-utils/routes.js';
import { makeBook, identity, pdf, approved } from '../../test-utils/fixtures.js';

const { state: s, get, post } = routeFixture();
async function published(title = 'Animal welfare guide', topic = 'Animal welfare') {
  const book = makeBook();
  Object.assign(book, { title, topic, status: 'approved', completedAt: new Date() });
  s.storage.objects.set(book.stagingKey, pdf);
  book.object = await s.storage.head(book.stagingKey);
  await s.repo.books().insertOne(book);
  return book;
}
describe('Library search and personal saved books', () => {
  it('searches all pages by a literal title and exact topic while keeping private books hidden', async () => {
    for (let i = 0; i < 15; i++) await published(`Animal care ${i}`);
    await published('A literal [.*] guide', 'Surgery');
    const hidden = makeBook(); hidden.title = 'Private [.*] guide'; await s.repo.books().insertOne(hidden);
    const first = await get('/books?q=animal');
    expect(first.body.total).toBe(15); expect(first.body.pages).toBe(2); expect(first.body.items).toHaveLength(12);
    expect((await get('/books?q=ANIMAL&page=2')).body.items).toHaveLength(3);
    const literal = await get('/books?q=%5B.*%5D&topic=Surgery');
    expect(literal.body.items.map((b: { title: string }) => b.title)).toEqual(['A literal [.*] guide']);
    expect((await get('/books?topic=Animal%20welfare&q=literal')).body.total).toBe(0);
    for (const query of ['topic=unknown', 'q=' + 'a'.repeat(101), 'q[$ne]=x', 'saved=maybe']) {
      expect((await get('/books?' + query)).status).toBe(400);
    }
  });
  it('saves idempotently, persists across sessions, and isolates each main account', async () => {
    const book = await published();
    s.auth.current = identity('reader', 'user');
    const saves = await Promise.all(Array.from({ length: 5 }, () => post(`/books/${book._id}/save`, { saved: true })));
    expect(saves.every(result => result.status === 200)).toBe(true);
    expect(await s.repo.saved().countDocuments()).toBe(1);
    expect((await get('/books?saved=true')).body.items[0].saved).toBe(true);
    s.auth.current = identity('another-reader', 'admin');
    expect((await get('/books?saved=true')).body.total).toBe(0);
    expect((await get('/books')).body.items[0].saved).toBe(false);
    await post(`/books/${book._id}/save`, { saved: false });
    expect(await s.repo.saved().countDocuments()).toBe(1);
    s.auth.current = identity('reader', 'user');
    expect((await get('/books?saved=true')).body.total).toBe(1);
    await post(`/books/${book._id}/save`, { saved: false });
    expect((await get('/books?saved=true')).body.total).toBe(0);
  });
  it('requires live authentication and CSRF for saving and never reveals withdrawn saved books', async () => {
    const book = await published();
    expect((await request(s.app).post(`/api/v1/books/${book._id}/save`).send({ saved: true })).status).toBe(401);
    expect((await request(s.app).post(`/api/v1/books/${book._id}/save`).set('Cookie', s.cookie).send({ saved: true })).status).toBe(403);
    expect((await post(`/books/${book._id}/save`, { saved: true, userId: 'other' })).status).toBe(400);
    await post(`/books/${book._id}/save`, { saved: true });
    await s.repo.books().updateOne({ _id: book._id }, { $set: { status: 'rejected' } });
    expect((await get('/books?saved=true')).body.items).toEqual([]);
    expect((await post(`/books/${book._id}/save`, { saved: true })).status).toBe(404);
    expect((await post(`/books/${book._id}/save`, { saved: false })).status).toBe(200);
    s.auth.disabled = true;
    expect((await get('/books')).status).toBe(401);
  });
});
describe('Private previews and review details', () => {
  it('only grants approved previews and does not consume download credits', async () => {
    const book = await published();
    s.auth.current = identity('reader', 'user');
    expect((await post(`/books/${book._id}/preview`)).status).toBe(200);
    expect(await s.repo.quotas().countDocuments()).toBe(0);
    expect((await request(s.app).post(`/api/v1/books/${book._id}/preview`).set('Cookie', s.cookie)).status).toBe(403);
    await s.repo.books().updateOne({ _id: book._id }, { $set: { status: 'pending' } });
    expect((await post(`/books/${book._id}/preview`)).status).toBe(404);
    s.auth.current = identity();
    expect((await post(`/books/${book._id}/preview`)).status).toBe(404);
    expect((await post('/books/not-an-id/preview')).status).toBe(404);
  });
  it('includes submission and review dates only for the owner upload view', async () => {
    const book = await published();
    const checkedAt = new Date();
    await s.repo.books().updateOne({ _id: book._id }, { $set: { moderation: { ...approved, checkedAt } } });
    const mine = (await get('/books/mine')).body.items[0];
    expect(mine.submittedAt).toBe(book.completedAt?.toISOString());
    expect(mine.reviewedAt).toBe(checkedAt.toISOString());
    expect((await get('/books')).body.items[0]).not.toHaveProperty('reviewedAt');
    s.auth.current = identity('other-author');
    expect((await get('/books/mine')).body.total).toBe(0);
  });
});
