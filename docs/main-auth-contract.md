# Main authentication contracts

## Shared browser sign-in

Main owns account login and browser sessions. Books automatically starts an OIDC
authorization-code handoff when it has no valid Books session. Main reuses an
active, email-verified browser session without a second sign-in or continuation
screen. Anonymous visitors use main's login page and then return to Books.

Register `vetify-books` as a confidential client with `client_secret_post` and a
separate `OIDC_BOOKS_CLIENT_SECRET` of at least 32 characters. Set that same value
as `AUTH_CLIENT_SECRET` in Books. Do not reuse Anatomy's client secret, main's
signing keys, or the Books capability service credential.

Allow the exact callback `http://localhost:5175/auth/callback` for development,
or `https://books.vetify.page/auth/callback` for production. Main's configuration
selects one exact callback according to its issuer. No arbitrary callback or
external return URL is accepted. Books retains only its supported page paths.

Discover the provider at `MAIN_AUTH_ORIGIN` plus
`/api/oidc/.well-known/openid-configuration`. Its issuer is `MAIN_AUTH_ORIGIN`
plus `/api/oidc`. The existing native `/api/v1/auth/:provider` routes are not OIDC
authorization endpoints, and native version-1 introspection is not used by Books.

The registered endpoints are `/api/oidc/auth`, `/api/oidc/token`,
`/api/oidc/token/introspection` and `/api/oidc/jwks`. Books requests `openid email`
with unpredictable state and nonce, S256 PKCE, and no forced login prompt.
Codes are short-lived, single-use and bound to the client, callback and verifier.
Books validates issuer, audience, nonce and the ID token's RS256 signature.

Books keeps app access tokens on the server, encrypted in a Books-only Mongo
session, with a hashed opaque HttpOnly host cookie in the browser. No access
token enters a browser URL or storage. It introspects each protected request
using the Books client credential and checks the active token, issuer, client,
audience, immutable subject, expiry, verified email and active account.

Main binds OIDC grants to the originating native browser session and session
version. Logout, revocation and account restrictions invalidate app access.
Introspection must not authorize another client's token. Books also checks
current account capabilities below and matches their owner to the token subject.
Only current, verified professionals can submit or recheck documents.

## Worker capability endpoint

`POST /api/v1/auth/books-capabilities` accepts
`{"userId":"immutable-main-id","audience":"vetify-books"}` using the dedicated,
Books-only `MAIN_AUTH_SERVICE_TOKEN`. Main must scope that service credential to
capability lookups, validate its audience/expiry and restrict returned attributes.
Never use the main JWT signing secret or grant Books access to main databases.

Return `version: 2`, the main origin as `issuer`, `audience: "vetify-books"`,
the immutable user ID, current role/status, `emailVerified`, professional approval
and `validUntil` no more than thirty seconds ahead. The worker does not require a browser
session to remain open, and does not require providers, sessionActive or tokenExpiresAt.
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

## Joint acceptance

Exercise main password signup followed by Books sign-in, feature-initiated main
signup followed by main login, Google plus explicitly linked password, unlinked
provider collision, wrong client/callback/PKCE, code expiry and concurrent replay.
Verify disabled accounts, session-version changes, global logout and revoked
professional approval. Books and main include offline protocol and contract tests. Full acceptance also
requires the configured main and Books deployments and a real browser session.

Reference: [OAuth security best practice, RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).
