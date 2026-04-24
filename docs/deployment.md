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

   `wrangler.jsonc` currently contains a placeholder D1 `database_id`. Replace it with the real Cloudflare D1 database UUID before any remote migration or deploy.

3. Run the remote D1 migrations:

   ```sh
   npm run db:migrate:remote
   ```

4. Deploy the Worker and front-end assets:

   ```sh
   npm run deploy
   ```

5. Protect the deployed hostname with Cloudflare Access before sharing it with users.

## Data Safety

Do not edit balances manually. Correct accounting errors through correction or reversal documents so the ledger remains auditable.
