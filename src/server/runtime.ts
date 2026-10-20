import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { connect } from './models/database.js';
import { MainAuth } from './auth/main-auth.js';
import { LocalStorage } from './storage/local.js';
import { VercelBlobStorage } from './storage/vercel-blob.js';
import { ReviewService } from './services/review.js';

export async function runtime() {
  const config = loadConfig();
  const { client, repo } = await connect(config);
  const auth = new MainAuth(config);
  const storage = config.BOOKS_STORAGE === 'vercel-blob'
    ? new VercelBlobStorage(config.BLOB_STORE_ID!, config.BLOB_READ_WRITE_TOKEN)
    : new LocalStorage(config.LOCAL_STORAGE_DIR, config.LOCAL_STORAGE_SECRET!, config.CLIENT_ORIGIN);
  return { config, client, repo, auth, storage,
    review: new ReviewService(repo, storage, auth, undefined, undefined, config.NODE_ENV === 'production') };
}
