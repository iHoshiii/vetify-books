import type { Request, Response } from 'express';
import type { Config } from '../config/env.js';
import type { Repository } from '../models/database.js';
import { assert } from '../errors.js';
import { digest, opaque, seal, unseal } from './crypto.js';
import type { AuthAdapter, Identity } from './main-auth.js';

export class Sessions {
  name: string;
  constructor(public repo: Repository, public auth: AuthAdapter, public config: Config) {
    this.name = config.NODE_ENV === 'production' ? '__Host-books_session' : 'books_session';
  }
  options(maxAge?: number) {
    return { httpOnly: true, secure: this.config.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge };
  }
  async create(res: Response, token: string, expiresIn: number) {
    const raw = opaque();
    const csrf = opaque();
    await this.repo.sessions().insertOne({ _id: digest(raw), encryptedToken: seal(token, this.config.SESSION_ENCRYPTION_KEY),
      csrf, expiresAt: new Date(Date.now() + expiresIn * 1000) });
    res.cookie(this.name, raw, this.options(expiresIn * 1000));
  }
  async local(req: Request, write = false) {
    const raw = req.cookies?.[this.name];
    assert(typeof raw === 'string' && raw.length < 200, 401, 'Sign in with your Vetify account to continue.');
    const session = await this.repo.sessions().findOne({ _id: digest(raw), expiresAt: { $gt: new Date() } });
    assert(session, 401, 'Your Books session has expired.');
    if (write) {
      assert(req.get('Origin') === this.config.CLIENT_ORIGIN, 403, 'This request must come from Books.');
      assert(req.get('X-CSRF-Token') === session.csrf, 403, 'Refresh Books before trying again.');
    }
    return session;
  }
  async require(req: Request, write = false): Promise<{ identity: Identity; csrf: string }> {
    const session = await this.local(req, write);
    const identity = await this.auth.introspect(unseal(session.encryptedToken, this.config.SESSION_ENCRYPTION_KEY));
    return { identity, csrf: session.csrf };
  }
  async logout(req: Request, res: Response) {
    const raw = req.cookies?.[this.name];
    if (typeof raw === 'string') await this.repo.sessions().deleteOne({ _id: digest(raw) });
    res.clearCookie(this.name, this.options());
  }
}
