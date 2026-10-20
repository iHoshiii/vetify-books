import * as oauth from 'oauth4webapi';
import { z } from 'zod';
import type { Config } from '../config/env.js';
import { AppError, assert } from '../errors.js';

const identitySchema = z.object({
  version: z.literal(2), issuer: z.string().url(), audience: z.string(),
  user: z.object({ id: z.string().min(1).max(128), name: z.string().optional(), role: z.enum(['user', 'professional', 'admin']), status: z.literal('active') }),
  emailVerified: z.literal(true), sessionActive: z.literal(true),
  providers: z.array(z.string()),
  professional: z.object({ status: z.enum(['verified', 'pending', 'rejected', 'revoked']) }).optional(),
  validUntil: z.string().datetime(), tokenExpiresAt: z.string().datetime(),
});
export type Identity = z.infer<typeof identitySchema>;
const capabilitySchema = identitySchema.omit({ sessionActive: true, providers: true, tokenExpiresAt: true });
export type AuthorCapability = z.infer<typeof capabilitySchema>;
export interface AuthAdapter {
  introspect(token: string): Promise<Identity>;
  capability(userId: string): Promise<AuthorCapability>;
  authorizationUrl(state: string, verifier: string): Promise<string>;
  exchange(callback: URL, state: string, verifier: string): Promise<{ token: string; expiresIn: number }>;
}
export function validateIdentity(data: unknown, config: Pick<Config, 'MAIN_AUTH_ORIGIN' | 'AUTH_CLIENT_ID'>): Identity {
  const parsed = identitySchema.safeParse(data);
  assert(parsed.success, 401, 'Main sign-in or account verification is unavailable.');
  const identity = parsed.data;
  const valid = Date.parse(identity.validUntil);
  const expiry = Date.parse(identity.tokenExpiresAt);
  assert(identity.issuer === config.MAIN_AUTH_ORIGIN && identity.audience === config.AUTH_CLIENT_ID,
    401, 'This session was not issued for Books.');
  assert(valid > Date.now() && valid <= Date.now() + 30500 && valid <= expiry,
    401, 'Your session has expired. Sign in again.');
  return identity;
}
export function validateCapability(data: unknown, config: Pick<Config, 'MAIN_AUTH_ORIGIN' | 'AUTH_CLIENT_ID'>): AuthorCapability {
  const parsed = capabilitySchema.safeParse(data);
  assert(parsed.success, 401, 'Main professional verification is unavailable.');
  const capability = parsed.data;
  assert(capability.issuer === config.MAIN_AUTH_ORIGIN && capability.audience === config.AUTH_CLIENT_ID &&
    Date.parse(capability.validUntil) > Date.now() && Date.parse(capability.validUntil) <= Date.now() + 30500,
    401, 'Main professional verification has expired or is not for Books.');
  return capability;
}
export function verified(identity: Pick<Identity, 'user' | 'professional'>) {
  assert(identity.user.role === 'professional' && identity.professional?.status === 'verified',
    403, 'Only verified vet professionals can upload documents.');
}
export class MainAuth implements AuthAdapter {
  private server: oauth.AuthorizationServer;
  private client: oauth.Client;
  constructor(private config: Config, private request: typeof fetch = fetch) {
    this.server = {
      issuer: config.MAIN_AUTH_ORIGIN,
      authorization_endpoint: `${config.MAIN_AUTH_ORIGIN}/api/v1/auth/authorize`,
      token_endpoint: `${config.MAIN_AUTH_ORIGIN}/api/v1/auth/token`,
      code_challenge_methods_supported: ['S256'],
      authorization_response_iss_parameter_supported: true,
    };
    this.client = { client_id: config.AUTH_CLIENT_ID };
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
  async introspect(token: string) { return validateIdentity(await this.read('/api/v1/auth/introspect', token), this.config); }
  async capability(userId: string) {
    assert(this.config.MAIN_AUTH_SERVICE_TOKEN, 503, 'Main professional verification is not configured.');
    const identity = validateCapability(await this.read('/api/v1/auth/books-capabilities', this.config.MAIN_AUTH_SERVICE_TOKEN,
      { userId, audience: this.config.AUTH_CLIENT_ID }), this.config);
    assert(identity.user.id === userId, 403, 'Professional ownership could not be verified.');
    return identity;
  }
  async authorizationUrl(state: string, verifier: string) {
    const url = new URL(this.server.authorization_endpoint!);
    url.search = new URLSearchParams({ client_id: this.client.client_id, redirect_uri: this.config.AUTH_CALLBACK_URL,
      response_type: 'code', scope: 'books:read books:contribute', state,
      code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' }).toString();
    return url.href;
  }
  async exchange(callback: URL, state: string, verifier: string) {
    try {
      const params = oauth.validateAuthResponse(this.server, this.client, callback, state);
      const options = {
        [oauth.customFetch]: this.request, signal: AbortSignal.timeout(5000),
        ...(this.config.NODE_ENV !== 'production' ? { [oauth.allowInsecureRequests]: true } : {}),
      };
      const response = await oauth.authorizationCodeGrantRequest(this.server, this.client, oauth.None(), params,
        this.config.AUTH_CALLBACK_URL, verifier, options);
      const result = await oauth.processAuthorizationCodeResponse(this.server, this.client, response);
      assert(result.expires_in && result.expires_in > 0 && result.token_type.toLowerCase() === 'bearer',
        401, 'Main returned an invalid app session.');
      return { token: result.access_token, expiresIn: Math.min(result.expires_in, 86400) };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof oauth.ResponseBodyError || error instanceof oauth.AuthorizationResponseError) {
        if (error.error === 'unknown_account') throw new AppError(401, 'Create an account first to use the app.');
        if (error.error === 'account_exists') throw new AppError(401, 'Account already exist. Please login');
        if (error.error === 'provider_not_linked') throw new AppError(401, 'Link this login method explicitly in your main Vetify account.');
      }
      throw new AppError(401, 'Sign-in could not be completed. Try signing in again.');
    }
  }
}
