import { vercelServices } from './vercel-runtime.js';
import { dailyScreening } from './vercel-handlers.js';

export async function handler() {
  const { review } = await vercelServices();
  return dailyScreening(review);
}
