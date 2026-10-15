import { cronHandler } from '../../src/server/vercel-handlers.js';
import { vercelServices } from '../../src/server/vercel-runtime.js';
import { cleanAbandonedUploads } from '../../src/server/storage/retention.js';
import { VercelBlobStorage } from '../../src/server/storage/vercel-blob.js';

export default cronHandler(async () => {
  const { repo, storage } = await vercelServices();
  if (!(storage instanceof VercelBlobStorage)) throw new Error('Retention requires private Vercel Blob storage.');
  return cleanAbandonedUploads(repo, (key) => storage.removeIncoming(key));
});
