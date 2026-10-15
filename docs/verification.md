# Verified results

Verified 14 October 2026 on Windows with Node `v24.13.0` and npm, using this
checkout. All test databases/storage were isolated fixtures. Main's source,
real `.env`, accounts, database and stored documents were not modified.

| Command | Observed result |
| --- | --- |
| `npm test` | 69 tests passed across 15 files, exit 0 |
| `npm run build` | Client, API, scheduled worker and PDF worker built, exit 0 |
| `npm run lint` | Client/server/evaluation/Vercel entry type checks, ownership boundaries and source length checks passed, exit 0 |
| `npm run test:build` | Built HTTP API, production transfer boundary and emitted PDF worker passed, exit 0 |

At commit verification on 15 October 2026, `npm run lint` passed again. A fresh
`npm test` run passed 41 tests and skipped 28 after five suites failed to start
their isolated MongoDB fixtures (startup timeouts/internal errors). The C: drive
had approximately 6 MB free at inspection. The earlier 69-test success above
remains the last complete passing run. No application logic was changed for these commits.

The final client build emits a 206.20 kB main JS chunk and a separately loaded
393.30 kB affiliate chunk. The compiled smoke test verifies HTTP health, anonymous
library denial, absence of the local PDF-transfer endpoint in production and
real parsing through the emitted `.js` PDF worker using the deployed Vercel path.
The configured `includeFiles` glob resolves the emitted parser, PDF.js and native
canvas dependencies locally. This verifies file selection, not Vercel's remote bundle.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| File map and missing main contracts | `port-manifest.md`, `main-auth-contract.md` |
| Preserve useful source tests | Nine original screening tests, genuine PDF fixtures and adapted Books UI/upload/affiliate assertions |
| Ordinary-user/admin upload denial | `routes/__tests__/uploads.test.ts` |
| Unapproved/revoked verification, verified upload, disabled accounts and author ownership | Upload/API tests and main-auth contract tests |
| Revoked approval during screening | `services/__tests__/review.test.ts`, with a fresh post-verdict capability check |
| Invalid/oversized files, actual hashes, quarantine and duplicate races | Upload/review/storage tests and genuine parser tests |
| Scripts, corrupt PDFs, empty PDFs and unsupported verdicts/evidence | Original `book-screening.test.ts` |
| Image-only PDF support and actual PDF input for model vision | `services/__tests__/scanned-pdf.test.ts` |
| Bounded outages, uncertain screens, repeated jobs, expired leases and superseded workers | Review tests against isolated MongoDB |
| Three slots, 200-centavo eligible credit, self-download zero and unlimited further downloads | Download tests, including twenty concurrent requests |
| Duplicate request IDs cannot double-credit | Ten concurrent repeated requests credit once |
| Independent book/month slots, Singapore rollover and affiliate ownership/charts | Download/affiliate tests |
| Guessed object keys, cross-origin writes and missing CSRF cannot grant downloads | Download tests; local-ticket tampering/integrity tests |
| Private Blob grants, path/size/expiry restrictions, immutable reviewed-byte promotion, etag and stream checks | Offline Vercel Blob adapter tests |
| Daily authenticated cron and bounded worker invocation | `vercel-handlers.test.ts`, plus durable next-daily-retry test |
| Abandoned incoming-only cleanup, preservation of submitted files and financial history | Isolated retention test and restricted Blob deletion test |
| Main shared sign-in, immutable IDs and explicit linking boundary | OAuth state/issuer/callback/PKCE, single-use callback races, provider identity/error and no-local-users contract tests |
| Migration preserving IDs and financial history | `migration-plan.md`, planning only |
| Local setup, sample env, deployment and results | `README.md`, `.env.example`, `deployment.md`, this record |

## External verification still required

Main still supplies version-1 introspection and lacks the required complete
Books SSO/capability contracts. A real main password/signup/provider-linking,
global-logout and professional-approval joint run is blocked until main adds
those contracts. The local contract doubles prove Books enforcement, not main
compatibility. Books fails closed instead of using a local login bypass.

Gemini verdicts are mocked in automated tests. The parser and actual-byte input
are real, including image-only PDFs. No live model call or paid classification
evaluation was performed. The explicit evaluation script retains original
short-article, scan, resume, cover-only, injection, keyword and human-only cases,
plus blank/script checks. Run it with a Books-only key, then evaluate a labelled
multilingual/mixed/scanned corpus before changing model or policy or launching.

No Vercel project, Blob store, database or cloud deployment was created. Blob SDK
network methods/signing are mocked in adapter tests. Validate real private-store
OIDC, browser transfer/CORS, signed expiry, worker packaging and runtime sizing
in a separately authorized isolated Vercel deployment. Production targets Hobby
with daily screening. Migration is a plan, with no live export/import.

No browser-control/preview tool was available for full visual browser QA.
React DOM interaction tests and the production client build passed. Verify the
responsive library, upload transfer and charts in a browser during joint setup.

Git work is committed on `dev`, with `origin` configured as
`https://github.com/iHoshiii/vetify-books.git`. No push or deployment was made.
