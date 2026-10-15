# Books port manifest

Source: `C:/Users/Administrator/OneDrive/Desktop/Vetify`, inspected read-only.
The source application, its real `.env`, accounts, collections and stored files
were not changed or copied. This repository runs independently of that checkout.

| Source file | Destination or treatment |
| --- | --- |
| `src/shared/books.ts` | Preserved as `src/shared/books.ts` |
| `src/client/pages/books/books-page.tsx` | Adapted into `src/client/pages/books-page.tsx`, `components/book-card.tsx`, `components/upload-form.tsx`, and `components/pagination.tsx` |
| Main AuthProvider and API service | Replaced by `src/client/auth.tsx`, `api.ts`, and the server auth adapter |
| `src/client/pages/professionals/affiliate-page.tsx` | Adapted into `src/client/pages/affiliate-page.tsx` |
| Professional affiliate charts | Equivalent daily-credit and top-book charts in `components/affiliate-charts.tsx` |
| `src/client/services/affiliate.service.ts` | Narrow query through `api.ts` |
| `src/client/hooks/useDocumentTitle.ts` | Standalone title in `index.html` |
| Books entry in `console-routes.tsx` | `/manage`, with professional-only private views |
| `src/server/routes/v1/books.route.ts` | `src/server/routes/books.ts`, `uploads.ts`, `schemas.ts` |
| `src/server/models/books.ts` | `models/types.ts`, `commissions.ts`, `affiliate.ts`, `affiliate-charts.ts` |
| Books indexes in `src/server/models/index.ts` | Books-only indexes in `models/database.ts` |
| `src/server/services/book-screening.service.ts` | Preserved policy and verdict checks, split into `book-screening.service.ts`, `screening-policy.ts`, `pdf-inspection.ts` |
| `src/server/services/book-pdf.worker.ts` | Preserved PDF worker |
| `src/server/services/book-review.service.ts` | Adapted to storage/auth adapters in `services/review.ts` and a durable job interface/Mongo adapter in `jobs/` |
| Main user/professional/status lookups | Replaced with fresh, authoritative main API capability checks |
| Node interval scanner | Separate local `worker.ts` CLI and daily Vercel `api/cron/screen.ts` |
| Source server worker build entry | Emitted PDF worker included in the Vercel function; deployed-path parser checked by `test:build` |
| `src/server/test-utils/book-pdf.ts` | Preserved genuine PDF fixtures, including scan fixture generator |
| Main screening tests | Preserved `services/__tests__/book-screening.test.ts` |
| Main Books UI/upload/affiliate tests | Adapted assertions under `src/client/__tests__/`, using private URL transfers |
| Main Books API tests | Isolated equivalent authorization, quota, duplicate, quarantine, retry and concurrency cases |
| Main DB test helper | Narrowed to Books collections and MongoMemoryServer |
| `scripts/evaluate-book-screening.ts` | Synthetic PDF evaluation in this repository, with no database or user files |

Source transitive dependencies retained: React, React Query, lucide, Recharts,
MongoDB, Zod, Google GenAI, PDF.js and Node worker threads. Main's role middleware,
response helpers, users/professionals, subscription/status services, token-refresh
client and shared schemas are replaced with Books-owned equivalents. No other
Books-only definitions were found in the mixed shared schema file.

The default screening model matches the source's `gemini-3.5-flash` setting.
[Google's model lifecycle](https://ai.google.dev/gemini-api/docs/deprecations)
can route model aliases to replacements. Evaluate actual classification with the
chosen Books model before rollout. Offline provider mocks do not establish it.

Actual source collections are `books` and `book_download_quotas`. Destination
metadata remains in those collections. PDF `Binary` is replaced with a private
key/etag/size reference. Main author IDs become exact string representations,
not new identities. Book IDs remain Mongo ObjectIds. Quota primary keys and the
Singapore month key format remain compatible.

Books adds `books_sessions`, `books_login_transactions` and `books_rate_limits`.
Durable job state lives in the book document so completion and enqueueing are
one atomic update. There is no separate users or professional-approval database.

Preserved rules: 10 MiB PDFs, global SHA-256 duplicate detection, professional
role plus verified profile for submission, private unapproved documents,
owner-only management and professional ledger access. Three monthly commission
slots allow unlimited further downloads. Eligible credit is 200 centavos.
Self-downloads consume slots but earn zero, matching the source model.

Intentional changes: production transfers go directly to private Vercel Blob,
app writes never overwrite reviewed objects, repeated download request IDs do not create
duplicate credits, and provider outages stop after six attempts instead of
retrying forever. Owners can recheck after the existing one-minute cooldown,
subject to the shared ten-submissions-per-hour limit.
The selected Vercel Hobby plan runs screening and retries daily, with queued
backlog retained in Mongo rather than an in-process timer.

Main notifications are not emitted by the inspected Books scanner. No realtime
or notification collection is imported. Future notification delivery requires a
narrow main API contract before being added.

External integration work remains in [main-auth-contract.md](main-auth-contract.md).
