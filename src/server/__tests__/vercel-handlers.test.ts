import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { apiHandler, cronHandler, dailyScreening } from '../vercel-handlers.js';

it('authenticates cron before loading services and rejects query-string credentials', async () => {
  const run = vi.fn(async () => ({ processed: 1 }));
  const app = express().use('/cron', cronHandler(run, () => 's'.repeat(32)));
  expect((await request(app).get('/cron')).status).toBe(401);
  expect((await request(app).get('/cron?secret=' + 's'.repeat(32))).status).toBe(401);
  expect((await request(app).get('/cron').set('Authorization', 'Bearer wrong')).status).toBe(401);
  expect((await request(app).post('/cron')).status).toBe(405);
  expect(run).not.toHaveBeenCalled();
  const result = await request(app).get('/cron').set('Authorization', `Bearer ${'s'.repeat(32)}`);
  expect(result.status).toBe(200); expect(result.body).toEqual({ processed: 1 });
  expect(result.headers['cache-control']).toBe('no-store'); expect(run).toHaveBeenCalledOnce();
});
it('fails closed on missing cron configuration and hides runtime errors', async () => {
  const app = express().get('/missing', cronHandler(async () => null, () => undefined))
    .get('/failed', cronHandler(async () => { throw new Error('sensitive database URI'); }, () => 's'.repeat(32)));
  expect((await request(app).get('/missing')).status).toBe(503);
  const result = await request(app).get('/failed').set('Authorization', `Bearer ${'s'.repeat(32)}`);
  expect(result.status).toBe(503); expect(result.text).not.toContain('sensitive');
});
it('drains ready jobs and stops before starting work without sufficient runtime', async () => {
  let elapsed = 0;
  const review = { recoverExhausted: vi.fn(async () => {}), processOne: vi.fn(async () => { elapsed += 40000; return true; }) };
  expect(await dailyScreening(review, () => elapsed)).toEqual({ processed: 2, schedule: 'daily' });
  expect(review.recoverExhausted).toHaveBeenCalledOnce();
  review.processOne.mockResolvedValue(false);
  expect((await dailyScreening(review, () => elapsed)).processed).toBe(0);
});
it('routes rewritten API paths while retaining pagination and never accepts arbitrary paths', async () => {
  const inner = express().get('/api/v1/books', (req, res) => res.json({ page: req.query.page }));
  const getApp = vi.fn(async () => inner);
  const app = express().use(apiHandler(getApp));
  expect((await request(app).get('/api/index?booksPath=books&page=2')).body).toEqual({ page: '2' });
  expect((await request(app).get('/api/v1/books?page=3')).body).toEqual({ page: '3' });
  expect((await request(app).get('/api/index?booksPath=../private')).status).toBe(400);
  expect(getApp).toHaveBeenCalledTimes(2);
});
