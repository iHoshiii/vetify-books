import type { Config } from '../config/env.js';
import { AppError, assert } from '../errors.js';
import { OidcClient } from './oidc-client.js';
import { validateIdentity, validateCapability, type Identity, type AuthorCapability } from './identity.js';
export { validateIdentity, validateCapability, verified, type Identity, type AuthorCapability } from './identity.js';

export interface AuthAdapter {
  introspect(token: string): Promise<Identity>;
  capability(userId: string): Promise<AuthorCapability>;
  authorizationUrl(state: string, verifier: string, nonce: string): Promise<string>;
  exchange(callback: URL, state: string, verifier: string, nonce: string): Promise<{ token: string; expiresIn: number; subject?: string }>;
}
export class MainAuth implements AuthAdapter {
  private oidc: OidcClient;
  constructor(private config: Config, private request: typeof fetch = fetch) {
    this.oidc = new OidcClient(config, request);
  }
  private async read(path: string, token: string, body?: object) {
    try {
      const response = await this.request(`${this.config.MAIN_AUTH_ORIGIN}${path}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? { audience: this.config.AUTH_CLIENT_ID }),
        signal: AbortSignal.timeout(5000), cache: 'no-store', redirect: 'error',
      });
      if ([401, 403].includes(response.status)) throw new AppError(401, 'Your main session is no longer active.');
      assert(response.ok, 503, 'Main account verification is temporarily unavailable.');
      const json = await response.json();
      return json.data ?? json;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'Main account verification is temporarily unavailable.');
    }
  }
  async introspect(token: string) {
    const session = await this.oidc.introspect(token);
    const capability = await this.capability(session.subject);
    return validateIdentity({ ...capability, sessionActive: true, providers: [],
      tokenExpiresAt: new Date(session.expiresAt).toISOString(),
      validUntil: new Date(Math.min(Date.parse(capability.validUntil), session.expiresAt)).toISOString() }, this.config);
  }
  async capability(userId: string) {
    assert(this.config.MAIN_AUTH_SERVICE_TOKEN, 503, 'Main professional verification is not configured.');
    const identity = validateCapability(await this.read('/api/v1/auth/books-capabilities', this.config.MAIN_AUTH_SERVICE_TOKEN,
      { userId, audience: this.config.AUTH_CLIENT_ID }), this.config);
    assert(identity.user.id === userId, 403, 'Professional ownership could not be verified.');
    return identity;
  }
  authorizationUrl(state: string, verifier: string, nonce: string) {
    return this.oidc.authorizationUrl(state, verifier, nonce);
  }
  exchange(callback: URL, state: string, verifier: string, nonce: string) {
    return this.oidc.exchange(callback, state, verifier, nonce);
  }
}
