# Production environment values

`.env.production` is your ignored local worksheet. This setup generated its
session and cron secrets independently. Replace every remaining `<...>` value
before using it. `.env.production.example` is the committed placeholder reference.
The examples assume Books lives at `books.vetify.page`.
Replace that hostname if your registered `.page` domain differs.

In Vercel, open the Books project, Settings, Environment Variables. Add the
values below with **Production** selected. You can import the completed local
file there. Local files are excluded from deployment uploads, so creating the
file alone does not configure Vercel. Changes take effect on a new deployment.

## Required application values

| Variable | What to enter | Where it comes from / constraints |
| --- | --- | --- |
| `NODE_ENV` | `production` | Keep this exact value. Enables production HTTPS, storage and credential checks. |
| `MONGODB_URI` | `mongodb+srv://BOOKS_USER:ENCODED_PASSWORD@YOUR_CLUSTER/vetify_books?retryWrites=true&w=majority` | MongoDB Atlas connection string for an independent Books database user. Replace the username, password and hostname. The database path must be `/vetify_books`, not empty. |
| `MONGODB_DATABASE` | `vetify_books` | Must exactly match the database name in `MONGODB_URI`. |
| `MAIN_AUTH_ORIGIN` | The main Vetify app's real HTTPS origin | Example only: `https://vetify.page`. Use the address that actually serves main's auth API. No trailing slash, path, query or fragment. |
| `AUTH_CLIENT_ID` | `vetify-books` | Register this exact client ID in main, or use the exact ID main assigns. This is a public PKCE client, with no client secret. |
| `AUTH_CALLBACK_URL` | `https://books.vetify.page/auth/callback` | Register this exact URL in main. The origin must match `CLIENT_ORIGIN`. No extra query or fragment. |
| `CLIENT_ORIGIN` | `https://books.vetify.page` | The canonical public Books origin. No trailing slash or path. Must match the custom domain assigned to production in Vercel. |
| `BOOKS_STORAGE` | `vercel-blob` | Required in production. Local disk is development only. |
| `BLOB_STORE_ID` | The actual private Books Blob store ID | Create a private Vercel Blob store and connect it to this project for Production. Use the store ID from Vercel, not its URL or display name. Confirm the environment variable exists after connecting. |
| `SESSION_ENCRYPTION_KEY` | A new random 64-character hexadecimal string | Generate 32 random bytes using the command below. Independent Books session encryption key. Keep stable across deployments. |
| `MAIN_AUTH_SERVICE_TOKEN` | The Books capability service credential issued by main | Main must issue and accept a credential limited to Books capability lookups. A random value generated only in Books will not work. Never use main's JWT signing key. |
| `CRON_SECRET` | A second independently generated secret, at least 32 characters | Generate another 32-byte hex value. Vercel sends it as the cron authorization bearer token. Use a different value from the session encryption key. |
| `GEMINI_API_KEY` | A dedicated Books Gemini API key | Create it in Google AI Studio for a project with access to the selected model. Server only. Needed for live content screening, although startup permits it to be absent. |
| `GEMINI_BOOK_MODEL` | A model ID available to your Gemini project | The current app default is `gemini-3.5-flash`. Confirm availability and run the existing screening evaluation before selecting a different model. The configured default is not proof of provider access. |
| `VITE_API_URL` | `/api/v1` | Public build-time setting. UI and API share the Books domain, so keep this relative path. Redeploy after changing it. |

## Generate the two local secrets

The created local worksheet already has these two secrets. If creating a fresh
file from the example, run this twice and use each output for a different variable:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use the first output for `SESSION_ENCRYPTION_KEY` and the second for `CRON_SECRET`.
Do not paste these values into GitHub issues, commits or browser variables.
Changing the encryption key makes existing encrypted Books sessions unreadable,
so users will need to sign in again.

## MongoDB setup

Create an Atlas database user with read/write access limited to `vetify_books`.
Use Atlas's application connection string, explicitly including that database.
URL-encode reserved characters in the password component, such as `@` as `%40`,
`#` as `%23`, and `/` as `%2F`. Keep the full URI private.

Configure Atlas Network Access to admit your Vercel runtime's outbound traffic.
The CI tests use MongoMemoryServer and need no Atlas credential or access rule.
Do not substitute main's MongoDB connection string. The app rejects reserved
database names and a URI whose database differs from `MONGODB_DATABASE`.

## Blob authentication and optional variables

On Vercel, prefer its rotating OIDC credentials with `BLOB_STORE_ID`. The SDK
reads `VERCEL_OIDC_TOKEN` automatically. Do not generate or paste an OIDC token.
See [Vercel Blob authentication](https://vercel.com/docs/vercel-blob/using-blob-sdk).

| Variable | Production handling |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Leave absent for Vercel OIDC. If explicitly using token authentication, use only the private Books store's token. Never use a placeholder or an empty imported row. |
| `PORT` | Omit on Vercel. Serverless handlers do not use the standalone server's listening port. |
| `LOCAL_STORAGE_DIR` | Omit. Production uses private Blob storage. |
| `LOCAL_STORAGE_SECRET` | Omit. Only the development filesystem adapter needs it. |
| `VERCEL_OIDC_TOKEN` | Managed and rotated by Vercel. Do not add a static value. |

Only `VITE_API_URL` should be exposed to the frontend. Database, Blob, Gemini,
service and encryption credentials must have no `VITE_` prefix.
Use separate databases, stores, keys and client registrations if you later
enable Preview or Development environments.

## Authentication prerequisite

Main needs the PKCE authorize/token endpoints, version-2 introspection, the Books
capability endpoint and the exact production callback registration described in
[the main auth contract](main-auth-contract.md). The existing repository notes
say main exposed version 1 when inspected. Verify its current implementation.
Environment values alone cannot make incompatible auth endpoints work.

## Local use of the production worksheet

Vite reads `.env.production` for production frontend builds. The standalone
Node server uses `dotenv/config`, which defaults to `.env`. To explicitly load
the worksheet for a local built server, use:

```powershell
$env:DOTENV_CONFIG_PATH = '.env.production'
npm.cmd start
```

Existing process variables take precedence over dotenv values. Local execution
has no Vercel runtime OIDC identity. It needs a private Books Blob token or a
properly configured Vercel development identity to access Blob. Running the
server against production values can access live services. Use the normal
development `.env` for routine local work.

See [CI, Vercel and domain setup](production-setup.md) for deployment credentials
and the Name.com DNS steps.
