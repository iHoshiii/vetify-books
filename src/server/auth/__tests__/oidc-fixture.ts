import { generateKeyPairSync, sign } from 'node:crypto';
import { vi } from 'vitest';
import { config, identity } from '../../test-utils/fixtures.js';
import { MainAuth } from '../main-auth.js';

export function oidcFixture() {
  const settings = { ...config, AUTH_CLIENT_SECRET: 'independent-books-oidc-secret-32-characters', MAIN_AUTH_SERVICE_TOKEN: 'books-service-token' };
  const issuer = `${config.MAIN_AUTH_ORIGIN}/api/oidc`;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const state = { nonce: 'nonce', grantError: '', tokenSubject: 'main-professional',
    introspection: {} as Record<string, unknown>, idClaims: {} as Record<string, unknown>,
    metadata: {} as Record<string, unknown>, corruptSignature: false };
  function idToken() {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'books-test-key' })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: issuer, aud: config.AUTH_CLIENT_ID, sub: state.tokenSubject,
      nonce: state.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
      ...state.idClaims })).toString('base64url');
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${claims}`), privateKey).toString('base64url');
    return `${header}.${claims}.${state.corruptSignature ? 'A'.repeat(signature.length) : signature}`;
  }
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith('/.well-known/openid-configuration')) return Response.json({
      issuer, authorization_endpoint: `${issuer}/auth`, token_endpoint: `${issuer}/token`,
      introspection_endpoint: `${issuer}/token/introspection`, jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'], subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_post'], ...state.metadata,
    });
    if (url.pathname.endsWith('/token/introspection')) return Response.json({
      active: true, iss: issuer, aud: config.AUTH_CLIENT_ID, client_id: config.AUTH_CLIENT_ID,
      sub: 'main-professional', exp: Math.floor(Date.now() / 1000) + 3600,
      email_verified: true, account_active: true, ...state.introspection,
    });
    if (url.pathname.endsWith('/token')) return state.grantError
      ? Response.json({ error: state.grantError }, { status: 400 })
      : Response.json({ access_token: 'books-token', token_type: 'Bearer', expires_in: 3600, id_token: idToken() });
    if (url.pathname.endsWith('/jwks')) return Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'books-test-key', alg: 'RS256', use: 'sig' }] });
    if (url.pathname.endsWith('/books-capabilities')) return Response.json({ data: identity() });
    throw new Error('Unexpected offline auth request.');
  });
  const callback = new URL(config.AUTH_CALLBACK_URL);
  callback.search = new URLSearchParams({ code: 'single-use-code', state: 'state', iss: issuer }).toString();
  return { adapter: new MainAuth(settings, fetcher), fetcher, state, callback, settings, issuer };
}
