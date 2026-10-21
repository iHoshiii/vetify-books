# vetify-books

Independent React/TypeScript veterinary document library, Express API, Books-only
MongoDB metadata, private file storage and a separate durable screening worker.
This is the Books library, not appointment booking.
Production targets Vercel Hobby with private Vercel Blob storage and daily screening.

## Current integration boundary

The application builds and tests independently. Sign-in uses main's shared OIDC
provider and a separate Books capability API. Main must register the Books
client with its exact callback and independent client secret. Existing main
browser sessions are reused automatically. Signed-out visitors use main login.
See the [required contracts](docs/main-auth-contract.md). No development login
bypass, local account database or shared main signing key is included.

## Local setup

Use Node 24 and npm. On Windows PowerShell, use `npm.cmd` if execution policy
blocks `npm.ps1`.

```sh
npm ci
```

Copy `.env.example` to your local `.env` yourself and replace placeholders.
Provide a credential restricted to the independent `vetify_books` database on
your local MongoDB. Main's Mongo URI is not a valid substitute. The sample's
`BOOKS_STORAGE=local` keeps PDFs under ignored `.data/pdfs`.

Generate independent random secrets with:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use separate values for `LOCAL_STORAGE_SECRET` and `SESSION_ENCRYPTION_KEY`.
Set `AUTH_CLIENT_SECRET` to main's independent `OIDC_BOOKS_CLIENT_SECRET`.
The encryption key is exactly 64 hex characters. Obtain a Books-only capability
credential from main for `MAIN_AUTH_SERVICE_TOKEN`. A Books-only Gemini key is
optional for startup but required for live content classification. Without it,
valid PDFs remain private and eventually become unverified after bounded retries.

```sh
npm run dev
```

Client: `http://localhost:5175`. API: port `8102`, under `/api/v1`.
Vite proxies `/api` to the API. The dev command launches the client, API and
independent local worker. Register the exact callback
`http://localhost:5175/auth/callback` in main once its SSO contract is available.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Client, API and separate worker |
| `npm run build` | Check types, build client and emit API/PDF worker |
| `npm test` | UI, API, auth, PDF, storage and durable-job tests |
| `npm run lint` | Type checks, source length and ownership boundaries |
| `npm run test:build` | Smoke-test built API and emitted PDF worker |
| `npm start` | Built API only |
| `npm run worker` | Separate long-running built worker |
| `npm run worker:once` | Process at most one durable job and exit |
| `npm run preview` | Preview built frontend only |
| `npm run evaluate:screening` | Explicit live synthetic-PDF classification evaluation |

Tests use isolated MongoMemoryServer databases and offline storage/auth/provider
fixtures. The first test run may download a MongoDB binary into ignored `.cache`.
No test connects to the configured application database or main accounts.

## Behavior

Readers and admins can discover and download approved documents. Professionals
manage only their own submissions and see their own affiliate activity.
Uploads and rechecks require active, verified main professional approval.
PDFs are limited to 10 MiB and screened for structure and substantive veterinary
content. Invalid files, scripts, uncertain screens and unavailable providers
remain private. Identical bytes cannot create a second document identity.

There are three earning slots per reader/book/calendar month in Asia/Singapore.
Eligible downloads earn 200 centavos. Self-downloads earn zero. Further downloads
still succeed. Credits record authorized download-URL requests, not confirmed
reading or completed file saves. There is no payment or withdrawal integration.

## Delivery notes

- [Source manifest and preserved behavior](docs/port-manifest.md)
- [Main auth and capability requirements](docs/main-auth-contract.md)
- [Deployment, private storage and retention](docs/deployment.md)
- [Production environment values](docs/production-environment.md)
- [Main-only CI, Vercel and Name.com setup](docs/production-setup.md)
- [Feature-only migration plan](docs/migration-plan.md)
- [Verification results and remaining integration checks](docs/verification.md)

Production setup is committed on `chore/production-cicd`, based on `dev`.
The workflow tests pushes to `main` before deploying to Vercel. Configure the
project and deployment secrets using the setup guide before the first release.
