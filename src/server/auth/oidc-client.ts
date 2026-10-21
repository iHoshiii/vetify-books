import * as oauth from 'oauth4webapi';
import type { Config } from '../config/env.js';
import { AppError, assert } from '../errors.js';

export class OidcClient {
  private metadata?: Promise<oauth.AuthorizationServer>;
  private client: oauth.Client;
  constructor(private config: Config, private request: typeof fetch) {
    this.client = { client_id: config.AUTH_CLIENT_ID, id_token_signed_response_alg: 'RS256' };
  }
  private options() {
    return {
      [oauth.customFetch]: ((url, init) => this.request(url, { ...init, cache: 'no-store', redirect: 'error' })) as typeof fetch,
      signal: AbortSignal.timeout(5000),
      ...(this.config.NODE_ENV !== 'production' ? { [oauth.allowInsecureRequests]: true } : {}),
    };
  }
  private secret() {
    const secret = this.config.AUTH_CLIENT_SECRET;
    assert(secret && !secret.startsWith('<'), 503, 'Main single sign-on is not configured for Books.');
    return secret;
  }
  private async server() {
    this.secret();
    this.metadata ??= (async () => {
      const issuer = new URL(`${this.config.MAIN_AUTH_ORIGIN}/api/oidc`);
      const response = await oauth.discoveryRequest(issuer, this.options());
      const server = await oauth.processDiscoveryResponse(issuer, response);
      for (const endpoint of [server.authorization_endpoint, server.token_endpoint, server.introspection_endpoint, server.jwks_uri]) {
        assert(endpoint, 503, 'Main single sign-on metadata is incomplete.');
        const url = new URL(endpoint);
        assert(url.origin === this.config.MAIN_AUTH_ORIGIN && url.pathname.startsWith('/api/oidc/') && !url.username && !url.password,
          503, 'Main single sign-on metadata contains an invalid endpoint.');
      }
      return server;
    })().catch(() => {
      this.metadata = undefined;
      throw new AppError(503, 'Main single sign-on is temporarily unavailable.');
    });
    return this.metadata;
  }
  async authorizationUrl(state: string, verifier: string, nonce: string) {
    const server = await this.server();
    const url = new URL(server.authorization_endpoint!);
    url.search = new URLSearchParams({ client_id: this.config.AUTH_CLIENT_ID, redirect_uri: this.config.AUTH_CALLBACK_URL,
      response_type: 'code', scope: 'openid email', state, nonce,
      code_challenge: await oauth.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256' }).toString();
    return url.href;
  }
  async exchange(callback: URL, state: string, verifier: string, nonce: string) {
    try {
      const server = await this.server();
      const params = oauth.validateAuthResponse(server, this.client, callback, state);
      const response = await oauth.authorizationCodeGrantRequest(server, this.client, oauth.ClientSecretPost(this.secret()),
        params, this.config.AUTH_CALLBACK_URL, verifier, this.options());
      const result = await oauth.processAuthorizationCodeResponse(server, this.client, response, { expectedNonce: nonce, requireIdToken: true });
      await oauth.validateApplicationLevelSignature(server, response, this.options());
      const claims = oauth.getValidatedIdTokenClaims(result);
      assert(claims && result.expires_in && result.expires_in > 0 && result.token_type.toLowerCase() === 'bearer',
        401, 'Main returned an invalid app session.');
      return { token: result.access_token, expiresIn: Math.min(result.expires_in, 86400), subject: claims.sub };
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
  async introspect(token: string) {
    try {
      const server = await this.server();
      const response = await oauth.introspectionRequest(server, this.client, oauth.ClientSecretPost(this.secret()), token, this.options());
      const claims = await oauth.processIntrospectionResponse(server, this.client, response);
      const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
      assert(claims.active && claims.iss === server.issuer && claims.client_id === this.config.AUTH_CLIENT_ID &&
        audience.length === 1 && audience[0] === this.config.AUTH_CLIENT_ID && typeof claims.sub === 'string' &&
        claims.sub.length > 0 && claims.sub.length <= 128 && typeof claims.exp === 'number' &&
        claims.exp * 1000 > Date.now() && claims.email_verified === true && claims.account_active === true,
      401, 'Your main session is no longer active.');
      return { subject: claims.sub, expiresAt: claims.exp * 1000 };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(503, 'Main account verification is temporarily unavailable.');
    }
  }
}
