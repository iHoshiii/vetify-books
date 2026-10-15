# Required main authentication contracts

Main's inspected implementation exposes version-1 introspection. It does not
implement the complete external-app PKCE handoff or the capability response
below. Books intentionally rejects version 1. These endpoints are requirements
for main, not claims about its current availability. Main was not modified.

## Client registration and handoff

Register `vetify-books` with the exact callback
`http://localhost:5175/auth/callback` for development. Register the proposed
`https://books.vetify.page/auth/callback` separately for production, with its
exact client origin. No arbitrary callback, logout URL or return path is allowed.

`GET /api/v1/auth/authorize` accepts the registered client ID, redirect URI,
`response_type=code`, scopes `books:read books:contribute`, unpredictable state,
and PKCE `code_challenge` with `code_challenge_method=S256`.
The response redirects with `code`, the exact `state`, and `iss` equal to
`MAIN_AUTH_ORIGIN`. Codes must be short-lived, atomically single-use and bound
to the registered client, callback and PKCE challenge.

`POST /api/v1/auth/token` accepts form-encoded authorization-code grants from
the Books backend, including `client_id`, `redirect_uri`, `code`, and
`code_verifier`. This is a public PKCE client with no shared main signing key.
Return a Books-audience bearer `access_token`, positive `expires_in` and
`token_type=Bearer`, with no-store headers. Books uses the maintained
[oauth4webapi OAuth implementation](https://github.com/panva/oauth4webapi).
No access token enters the browser or a callback URL.

Books binds each handoff to a five-minute, single-use Mongo transaction and
an HttpOnly host cookie. The browser posts only the callback query to the
Books API, then clears it. Sensitive main credentials are encrypted with the
Books-only AES-256-GCM key inside a hashed, opaque-cookie session record.

## Version-2 introspection

`POST /api/v1/auth/introspect`, with the app bearer credential and JSON
`{"audience":"vetify-books"}`, must return this payload, directly or under `data`:

```json
{
  "version": 2,
  "issuer": "http://localhost:8000",
  "audience": "vetify-books",
  "user": { "id": "immutable-main-id", "name": "Display name", "role": "professional", "status": "active" },
  "emailVerified": true,
  "sessionActive": true,
  "providers": ["google", "password"],
  "professional": { "status": "verified" },
  "validUntil": "<UTC timestamp at most 30 seconds ahead>",
  "tokenExpiresAt": "<UTC token expiry, not before validUntil>"
}
```

Allowed roles are `user`, `professional`, `admin`. Professional status is
`verified`, `pending`, `rejected` or `revoked`, and may be absent for readers.
Main must freshly check bans, deactivation, verified email, token audience,
issuer and current browser/native session version. Password changes and global
logout must revoke the app credential. Books introspects each protected request
with a five-second timeout and no local authority cache. Role alone cannot upload.

## Worker capability endpoint

`POST /api/v1/auth/books-capabilities` accepts
`{"userId":"immutable-main-id","audience":"vetify-books"}` using the dedicated,
Books-only `MAIN_AUTH_SERVICE_TOKEN`. Main must scope that service credential to
capability lookups, validate its audience/expiry and restrict returned attributes.
Never use the main JWT signing secret or grant Books access to main databases.

Return version, issuer, audience, user, emailVerified, professional and validUntil
as above. The worker contract does not require the author to keep a browser
session open, and does not require providers, sessionActive or tokenExpiresAt.
Check the current author account and actual professional approval record.
Books verifies that the returned main user ID is exactly the requested ID and
rechecks approval after a positive screen, immediately before publication.
Missing credentials/contracts, mismatched ownership and outages keep PDFs private.

## Linking, signup and logout

Main alone owns signup, verification, passwords, providers and explicit provider
linking. Books creates no local users and never matches accounts by email. The
account link returns to main. Main must offer the explicit linking flow there.
An unlinked provider collision must never silently attach an identity.

Supported OAuth errors: `unknown_account` displays
`Create an account first to use the app.`; `account_exists` displays
`Account already exist. Please login`; `provider_not_linked` directs users to
explicit main linking. Books logout clears only the Books session. Global logout
belongs to main and must invalidate subsequent Books introspection.

## Joint acceptance, blocked until main implements these additions

Exercise main password signup followed by Books sign-in, feature-initiated main
signup followed by main login, Google plus explicitly linked password, unlinked
provider collision, wrong client/callback/PKCE, code expiry and concurrent replay.
Verify disabled accounts, session-version changes, global logout and revoked
professional approval. Books tests its boundary with isolated contract doubles;
they do not establish current main compatibility or a live linking integration.

Reference: [OAuth security best practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).
