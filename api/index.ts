import { apiHandler } from '../src/server/vercel-handlers.js';
import { vercelApp } from '../src/server/vercel-runtime.js';

export default apiHandler(vercelApp);
