# Vercel Hobby deployment and retention

The deployment target is Vercel Hobby, with private Vercel Blob PDFs and daily
screening. This checkout contains configuration and entry points only. No Vercel
project, storage, database, DNS, deployment or main client registration was created.
The proposed public address remains `https://books.vetify.page`.

## Project setup

Import `iHoshiii/vetify-books` into Vercel when a commit and deployment are
authorized. Choose Node 24 and the Vite framework. `vercel.json` builds with
`npm run build`, serves `dist/client`, enables Fluid compute and places Node
functions in Singapore (`sin1`). Keep the repository root as the project root.
Production serves UI and API on one HTTPS origin. The lockfile uses npm.

`api/index.ts` wraps Express without starting a listening server. Rewrites send
`/api/v1/*` to that handler and preserve query parameters. `/manage`, `/affiliate`
and `/auth/callback` load the React SPA. Other API paths are not swallowed by a
broad SPA fallback. API/auth responses are not cached. Mongo connections and
service instances are reused within warm functions.

Create a dedicated private Blob store connected to this project. Use separate
preview/development storage and databases. Vercel provides rotating OIDC credentials
and `BLOB_STORE_ID` when the store is connected. Leave optional
`BLOB_READ_WRITE_TOKEN` unset in production to use OIDC.
See [Blob authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk).
No Blob credential belongs in a frontend variable or Git.

Set these server environment variables in Vercel:

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `BOOKS_STORAGE` | `vercel-blob` |
| `BLOB_STORE_ID` | Connected private Books store ID |
| `MONGODB_URI` | Dedicated Books database credential, with its database in the URI |
| `MONGODB_DATABASE` | `vetify_books`, matching the URI |
| `CLIENT_ORIGIN` | Exact Books HTTPS origin |
| `MAIN_AUTH_ORIGIN` | Exact main HTTPS origin |
| `AUTH_CALLBACK_URL` | Exact Books origin plus `/auth/callback` |
| `AUTH_CLIENT_ID` | Main-registered `vetify-books` client |
| `SESSION_ENCRYPTION_KEY` | Independent random 32 bytes encoded as 64 hex characters |
| `MAIN_AUTH_SERVICE_TOKEN` | Books-only main capability credential |
| `CRON_SECRET` | Independent random secret of at least 32 characters |
| `GEMINI_API_KEY` | Books-only screening key |
| `GEMINI_BOOK_MODEL` | Evaluated model, default `gemini-3.5-flash` |
| `VITE_API_URL` | `/api/v1`, the only frontend API setting |

Main must implement and register the [required auth contracts](main-auth-contract.md)
before sign-in works. The database user must access only Books collections.
No main database URI, JWT key, user collection or provider secret is shared.

## Private transfers and integrity

The API grants a five-minute, exact-path, PDF-only signed PUT URL bounded by
declared size. The browser sends PDFs directly to private Blob storage. This
avoids Vercel Functions' 4.5 MB request/response limit while retaining the 10 MiB
document limit. Finalization verifies actual size, private-store URL, pathname
and etag, then saves immutable quarantine bytes.
See [signed Blob URLs](https://vercel.com/changelog/signed-urls-are-now-available-for-vercel-blob)
and [function limits](https://vercel.com/docs/functions/limitations).

App writes disable overwrite and random suffixes. Reads bypass Blob caching and
verify the recorded etag/size. The worker hashes and parses actual bytes, applies
the preserved policy and writes the reviewed buffer into a new
`documents/<uuid>/<safe-title>.pdf` object. Retried copies must match existing
bytes. Downloads require approved metadata and current identity, verify the etag,
and issue a private GET capability expiring after sixty seconds. The stored
basename supplies the sanitized download filename.

Etags verify identity; Blob does not provide the S3 version-ID semantics of the
earlier design. Never externally overwrite quarantine or approved paths. A store
operator replacing/deleting objects can break valid references. Signed links
remain bearer capabilities until expiry, including after account revocation.

## Daily processing on Hobby

`/api/cron/screen` runs with `0 18 * * *`: nominally 02:00 Singapore time each day.
Hobby may trigger within the following hour and allows only daily cron frequency.
See [Hobby cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing).
Vercel supplies `Authorization: Bearer <CRON_SECRET>`; handlers authenticate it
before loading services and reject query-string secrets and non-GET requests.

The screen function has a 300-second limit. It recovers exhausted leases and
drains ready jobs while enough time remains to start another bounded attempt.
The API never starts an interval scanner. Completion and job creation are one
Mongo update. Claims use unique tokens and 180-second leases. Expired or superseded
workers cannot publish. The PDF child has a 256 MB JS heap limit and 30-second
parsing deadline, model calls have a 60-second deadline, and Blob operations have
20-second abort signals. `includeFiles` packages the emitted PDF worker, PDF.js
and native dependencies for the scheduled function.

Production outages/uncertainty retry at the next daily window, with a maximum
of six attempts and two uncertain checks. Exhausted jobs become private unverified
submissions. Unprocessed backlog waits for another invocation. Daily scheduling
does not guarantee approval within 24 hours. The UI explains this cadence.
Monitor backlog, expired leases and provider errors in Vercel logs and Mongo.
Validate worker sizing and packaging in an isolated rollout. Local `npm run dev`
retains its separate continuous worker and short retry backoff.

## Retention

`/api/cron/cleanup` runs daily at `0 19 * * *` with the same authentication.
It removes only `incoming/<uuid>.pdf` files for incomplete submissions whose
upload grants expired more than seven days ago, in bounded batches. It checks
that no completion or stored-object reference exists before removal and records
`incomingCleanedAt` for idempotency. Missing Blob objects are harmless.

Cleanup never removes quarantine, approved documents, submitted-file references,
book metadata or financial history. Completed incoming copies and orphaned
promotion copies are retained pending a separately reviewed cleanup policy.
Rejected/unverified files remain available for owner rechecks. No retention job,
deletion or database migration was executed against live storage here.

Local storage remains a development-only signed filesystem adapter under ignored
`.data/pdfs`. Production rejects it and exposes no PDF transfer route.
