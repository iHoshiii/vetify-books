# Main-only CI, Vercel and Name.com setup

## Pipeline behavior

`.github/workflows/production.yml` runs only for pushes to `main`, including PR
merges into `main`. It does not run for PR events, feature branches or `dev`.

```text
push / merge to main
  -> Testing: npm ci, lint, tests, build, built-API/PDF-worker smoke checks
  -> Production: deploy the tested commit to the configured Vercel project
```

Testing is an automated test job, not a deployed staging environment. Failed
checks prevent the Production job. Testing uses offline service fixtures and
isolated MongoMemoryServer databases, with no production credentials.

The Production job checks out the same commit and uploads its source using a
pinned Vercel CLI. Vercel performs the final production build with its Production
environment variables and native function packaging. This intentionally builds
again on Vercel after the CI build checks. Application secrets remain in Vercel.
See [Vercel CLI deployment](https://vercel.com/docs/cli/deploy).

Runs share one concurrency group and do not cancel an in-progress deployment.
GitHub may replace a pending run with a newer pending push. Keep `main` as your
release branch and merge changes when ready for production.

`vercel.json` disables automatic Git deployments for every branch so the Git
integration cannot publish before tests pass. CLI deployments still work.
See [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).
Disconnect the project's Git integration after import to enforce this across
older branches that do not yet contain the configuration.
Dashboard/manual deployments can still bypass this workflow, so use the
workflow for routine releases.

## 1. Prepare main on GitHub

This checkout started on `dev`, with only `origin/dev` known locally. If `main`
does not yet exist on GitHub, create it from the current `dev` base first. Set
GitHub's default branch to `main`, then merge `chore/production-cicd` into it after
completing the settings below. Future work stays on scoped branches such as
`feat/book-search`, `fix/upload-validation` or `chore/dependency-updates`.

The initial import of an older commit can deploy before this configuration
exists. Keep production traffic off that initial deployment until setup is ready.
This change creates local commits only. Publishing branches and changing remote
settings are separate setup actions.

## 2. Create or configure the Vercel project

1. Create/import the `iHoshiii/vetify-books` project in your intended Vercel scope.
2. Use the repository root, Vite framework, Node.js 24, and npm.
3. Keep build command `npm run build` and output directory `dist/client`.
4. If keeping the Git integration connected during setup, set its production
   branch to `main`. Then disconnect the repository under Project Settings, Git,
   so older branch configurations cannot trigger deployments. The workflow
   identifies the existing project through its IDs and needs no Git connection.
5. Create a **private** Books Blob store and connect it to Production.
6. Configure your Books MongoDB database/user and network access.
7. Add every value in [the environment guide](production-environment.md) to the
   Vercel project's Production environment. Replace every placeholder.
8. Finish main's auth registration and required endpoints before user sign-in.

The existing config places functions in Singapore and runs daily screening and
cleanup crons. Keep these settings when importing. A Vercel project and valid
environment values must exist before the workflow can deploy successfully.

## 3. Add GitHub deployment secrets

In GitHub, open repository Settings, Environments, create `production`, and
allow deployment branches to include only `main`. Add these environment secrets:

| GitHub secret | Exact value / source |
| --- | --- |
| `VERCEL_TOKEN` | A Vercel access token with access to the scope containing this Books project. Create it in your Vercel account's token settings. Track its expiry and rotate it when needed. |
| `VERCEL_ORG_ID` | The owning Vercel scope ID, usually `team_...`. Use `orgId` from a linked `.vercel/project.json` rather than guessing from the team's display name. |
| `VERCEL_PROJECT_ID` | The Books project's ID, usually `prj_...`. Find it in Vercel Project Settings or `projectId` in `.vercel/project.json`. |

You can retrieve the two IDs by linking locally, without deploying:

```sh
npx vercel@64.7.0 link
```

Select the correct existing scope and Books project. `.vercel/` is ignored.
Store application variables such as MongoDB and Gemini credentials in Vercel,
not in these three GitHub secrets. The workflow reads these secrets only in the
Production job and fails explicitly if any are missing.

Leave environment reviewers unset for automatic testing-to-production delivery.
If you configure required reviewers, production will wait for their approval.
A rule requiring this push-only workflow on PRs would never complete, because
PR events deliberately do not trigger it. Protect `main` with PR reviews if
desired, and keep this workflow as the post-merge deployment gate.

## 4. Connect your .page domain at Name.com

Name.com is the registrar. Your website can use a `.page` domain regardless of
the registrar's `.com` address. These examples use `books.vetify.page`; substitute
your actual registered domain if different.

1. In Vercel Project Settings, Domains, add `books.vetify.page` for Production.
2. Copy the exact DNS record Vercel displays for that hostname.
3. If Name.com hosts your authoritative DNS, open that domain's **Manage DNS
   Records**. If its nameservers point elsewhere, edit records at that provider.
4. For the `books` subdomain, add a **CNAME**, Host `books`, Answer equal to
   Vercel's displayed target hostname, and leave the default TTL. The Answer
   contains no `https://` or path. Resolve conflicting records for `books`.
5. If Vercel asks for a verification TXT record, add the exact host and value.
6. Wait for Vercel to confirm the DNS configuration and issue a valid certificate.
7. Set `CLIENT_ORIGIN` and `AUTH_CALLBACK_URL` to the same HTTPS Books hostname,
   register the callback in main, and deploy with those production values.

For an apex such as `vetify.page`, follow Vercel's displayed apex A-record
instructions. Use a CNAME for `www` only if adding that hostname too. Keep
existing main-app and email records when routing only the `books` subdomain.
Copy current values from Vercel instead of hardcoding an example IP or CNAME.
See [Vercel custom domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
and [Name.com CNAME setup](https://www.name.com/support/articles/115004895548-adding-a-cname-record).

`.page` requires HTTPS in browsers because the entire TLD is HSTS preloaded.
Wait for a valid certificate before testing your public site.
See [Google Registry's .page documentation](https://www.registry.google/domains/page/).

## 5. First release checks

Merge the setup branch into `main` after the project, environment and secrets
are ready. Check GitHub Actions for successful Testing and Production jobs.
Visit `https://books.vetify.page/api/v1/health`, then test sign-in, a private PDF
upload, screening and an authorized download. Confirm both cron schedules are
registered in Vercel and inspect their authenticated executions after a daily
window. Local automated checks do not verify live main auth, DNS or cloud access.
