import { cronHandler, dailyScreening } from '../../src/server/vercel-handlers.js';
import { vercelServices } from '../../src/server/vercel-runtime.js';

export default cronHandler(async () => {
  const { review } = await vercelServices();
  return dailyScreening(review);
});
