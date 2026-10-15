# Prompt: initialize the separate Books repository

Paste everything below into the coding agent in `vetify-books`.

---

Port Vetify's document library into an independent React/TypeScript application
and server API. This feature is Books, not appointment booking. Preserve existing
behavior and create an independently buildable repository, database and storage.
Main source is `C:\Users\Administrator\OneDrive\Desktop\Vetify`.
Do not modify main, read/copy its real `.env`, copy user/auth collections, seed
live databases, deploy cloud resources or delete stored documents.
Ask for a source export if the source cannot be accessed.

## Source to inspect

- `src/client/pages/books/`, imported Books components/hooks/API clients.
- `src/client/pages/professionals/affiliate-page.tsx` and its dependencies.
- Books management entry in `src/client/routes/console-routes.tsx`.
- `src/shared/books.ts` and any Books-only definitions in mixed shared schemas.
- `src/server/routes/v1/books.route.ts`, `src/server/models/books.ts`.
- `src/server/services/book-screening.service.ts`, `book-review.service.ts`,
  `book-pdf.worker.ts`, test PDF fixture utilities and screening helpers.
- Existing Books UI/API/upload/screening tests and
  `scripts/evaluate-book-screening.ts`.
- Worker entries in `scripts/build-server.mjs`, `scripts/build-lambda.mjs` and
  the current model barrel's Books/download-quota indexing.

Inventory transitive imports. Preserve library listing, approved-document
visibility, PDF upload/download, duplicate detection/content hashes, screening,
professional management, existing allowance rules and affiliate/commission
tracking. Verify the actual model behavior instead of guessing quotas or prices.
Do not present tracked commissions as a functioning payment/payout integration.

## Authorization and shared accounts

Follow main `docs/main-deployment/shared-auth.md`.
Use main immutable user IDs for authors, readers and commission ownership.
Main alone owns signup, verification, passwords, providers and account linking.
Do not share main JWT signing secrets or database access with Books.

Existing upload logic requires a professional record with `status=verified`,
not merely a professional role. Main's current introspection response does not
include that approval. Specify the required main capability endpoint/claim and
fail closed until it is implemented; do not bypass approval for easier porting.
Readers, professionals and admins retain only their actual allowed operations.
Recheck approval for uploads and sensitive writes; prevent author impersonation.

## Storage and background processing

Use private Vercel Blob storage for production PDFs, with metadata in Books MongoDB.
Issue short-lived authorized upload/download URLs. Do not route large PDF bytes
through Vercel Functions or make the store public.
Keep uploaded files inaccessible until validation/screening approves them.
Validate declared/actual size, PDF structure, hashes and filename disposition.
Use a bounded daily cleanup for abandoned incoming uploads and an explicit retention policy.

Run screening/review as a durable queued job, with persisted status, bounded
retries and idempotent processing. The existing Node interval scanner is not
reliable in Vercel Functions. Target Vercel Hobby with daily authenticated cron,
document payload/runtime limits, and persist jobs independently of invocations.
Retain a local test storage/worker adapter.
If completion creates a main notification, request it via an authenticated API;
do not import main realtime internals or write directly to main collections.

## Repository and configuration

Use npm, Node 24, TypeScript and a lockfile. Supply dev, build and test commands.
Use modular server services, auth adapter, storage adapter and durable job adapter.
Create a placeholder sample, implement these names and validate configuration:

```dotenv
NODE_ENV=development
PORT=8102
MONGODB_URI=<books_database_only>
MAIN_AUTH_ORIGIN=http://localhost:8000
AUTH_CLIENT_ID=vetify-books
AUTH_CALLBACK_URL=http://localhost:5175/auth/callback
CLIENT_ORIGIN=http://localhost:5175
BOOKS_STORAGE=vercel-blob
BLOB_STORE_ID=<private_books_blob_store_id>
CRON_SECRET=<random_at_least_32_characters>
GEMINI_API_KEY=<books_screening_key_if_required>
VITE_API_URL=/api/v1
```

Production address is proposed as `https://books.vetify.page`. Register its exact
main auth callback. Use the connected private store's rotating Vercel OIDC credentials.
No server secrets belong in VITE settings or version control.

## Acceptance

1. Provide a file port manifest and list missing main auth/capability contracts.
2. Preserve and run useful existing tests against isolated databases/storage.
3. Test ordinary-user upload denial, unapproved-professional denial, revoked
   approval, verified upload, cross-author access denial and disabled accounts.
4. Test invalid/oversized PDFs, duplicate files, quarantine, worker retries,
   unavailable screening and repeated messages without duplicate commissions.
5. Preserve commission-slot behavior: the current model allows three commission
   slots per user/book/month, not a download ban. Own-author downloads earn zero;
   eligible commission is 200 centavos. Verify concurrency without double credit.
   Unauthorized users cannot obtain a download URL by knowing an object key.
6. Test main shared sign-in and explicit provider linking without local users.
7. Prepare a migration plan for PDFs/metadata/allowances/commissions preserving
   main IDs; do not modify live data. Inventory actual collections from the model.
8. Document local setup, sample env, deployment design and verified test results.

Keep appointments, user messages, video calls and main professional onboarding
out of this repository. Main will retain only links to the Books application.
