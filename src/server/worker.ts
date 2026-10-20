import { setTimeout } from 'node:timers/promises';
import { runtime } from './runtime.js';

const services = await runtime();
let stopped = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { stopped = true; });
try {
  do {
    await services.review.recoverExhausted();
    const worked = await services.review.processOne();
    if (process.argv.includes('--once')) break;
    if (!worked && !stopped) await setTimeout(15000);
  } while (!stopped);
} finally { await services.client.close(); }
