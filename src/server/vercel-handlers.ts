import { timingSafeEqual } from 'node:crypto';
import type { Request, Response, Express } from 'express';
import type { ReviewService } from './services/review.js';

export function apiHandler(getApp: () => Promise<Express>) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url!, 'https://books.invalid');
      const path = url.searchParams.get('booksPath');
      if (path !== null) {
        url.searchParams.delete('booksPath');
        if (!/^[a-zA-Z0-9/_-]*$/.test(path)) { res.status(400).json({ error: 'Invalid API path.' }); return; }
        req.url = `/api/v1/${path}${url.search}`;
      }
      const app = await getApp();
      await new Promise<void>((resolve, reject) => {
        res.once('finish', resolve); res.once('close', resolve);
        app(req, res, (error?: unknown) => error ? reject(error) : resolve());
      });
    } catch {
      if (!res.headersSent) res.status(503).json({ error: 'Books is temporarily unavailable.' });
    }
  };
}
export function cronHandler(run: () => Promise<unknown>, secret = () => process.env.CRON_SECRET) {
  return async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.status(405).end(); return; }
    const expected = secret();
    if (!expected || expected.length < 32 || expected.startsWith('<')) { res.status(503).json({ error: 'Cron is not configured.' }); return; }
    const supplied = Buffer.from(req.headers.authorization ?? '');
    const authorized = Buffer.from(`Bearer ${expected}`);
    if (supplied.length !== authorized.length || !timingSafeEqual(supplied, authorized)) {
      res.status(401).json({ error: 'Unauthorized.' }); return;
    }
    try { res.json(await run()); }
    catch { res.status(503).json({ error: 'Scheduled processing is temporarily unavailable.' }); }
  };
}
export async function dailyScreening(review: Pick<ReviewService, 'recoverExhausted' | 'processOne'>,
  now = Date.now, deadline = now() + 270000) {
  await review.recoverExhausted();
  let processed = 0;
  while (deadline - now() >= 210000 && await review.processOne()) processed++;
  return { processed, schedule: 'daily' };
}
