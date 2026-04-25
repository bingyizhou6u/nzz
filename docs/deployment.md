# Deployment Notes

## Local Development Verification

Run the local setup and verification commands from the project root:

```sh
npm install
npm run db:migrate:local
npm run build
npm run cf:dev
```

With the local Worker running, verify the health endpoint:

```sh
curl http://127.0.0.1:8787/api/health
```

The endpoint should return JSON with `ok: true`. If port `8787` is already in use, start Wrangler on a free port and verify `/api/health` on that port.

## Cloudflare Setup

1. Create the D1 database named `management-ledger-db`:

   ```sh
   npx wrangler d1 create management-ledger-db
   ```

2. Copy the returned `database_id` into `wrangler.jsonc`.

   The committed `wrangler.jsonc` is bound to the current production D1 database. If the Cloudflare environment is recreated, replace `database_id` with the new D1 database UUID before any remote migration or deploy.

3. Run the remote D1 migrations:

   ```sh
   npm run db:migrate:remote
   ```

4. Deploy the Worker and front-end assets:

   ```sh
   npm run deploy
   ```

5. Protect the deployed hostname with Cloudflare Access before sharing it with users.

Current Workers hostname:

```text
https://management-ledger.bingyizhou6u.workers.dev
```

## Cloudflare Access Authentication

Production deployments must be protected by a Cloudflare Access self-hosted application. Configure Access for the deployed Worker hostname and set these Worker variables:

```sh
AUTH_MODE=access
CF_ACCESS_TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
CF_ACCESS_AUD=<Application Audience AUD tag>
```

The Worker validates the `Cf-Access-Jwt-Assertion` request header against the configured team domain and Access application audience before resolving the actor from `people.login_email`.

Do not share the deployed hostname until Access is enabled and at least one `people.login_email` is mapped to an enabled admin account.

After Cloudflare Access is configured, bootstrap the first admin login mapping in remote D1 with placeholders replaced locally:

```sh
wrangler d1 execute management-ledger-db --remote --command "UPDATE people SET login_email = '<admin@example.com>' WHERE id = '<admin_person_id>'"
```

Run this only after Access is complete. Do not commit real email addresses or person ids.

For local development, use development auth with a local mapped login email and the explicit unsafe-development switch:

```sh
AUTH_MODE=development
ALLOW_INSECURE_DEV_AUTH=true
DEV_ACTOR_EMAIL=<local mapped people.login_email>
```

Never set `ALLOW_INSECURE_DEV_AUTH=true` in production. Do not commit real email addresses, secrets, Access audience tags, or account-specific credentials to the repository. Keep `.dev.vars` local-only for developer environment values.

## Data Safety

Do not edit balances manually. Correct accounting errors through correction or reversal documents so the ledger remains auditable.
