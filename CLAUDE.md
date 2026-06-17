# Site-web

Full-stack web application deployed on **Cloudflare**. Service-based monorepo: an
independently deployable frontend and backend API communicating over HTTP.

## Architecture

```
apps/
  web/   Svelte 5 + Vite SPA styled with Tailwind CSS v4, served by a Cloudflare Worker (static assets).
  api/   Hono Worker (the HTTP API) backed by a D1 (SQLite) database.
```

- **Frontend** (`apps/web`) is a static SPA. It calls the API over HTTP (`/api/*`).
- **Backend** (`apps/api`) is a Cloudflare Worker using [Hono](https://hono.dev).
  Persistent data lives in **D1** (bound as `DB`).
- The two services deploy independently; treat the HTTP boundary as the contract.

## Common commands

Run from the repo root (npm workspaces):

| Command | What it does |
|---|---|
| `npm install` | Install all workspace dependencies |
| `npm run dev:web` | Run the frontend dev server (Vite) |
| `npm run dev:api` | Run the API Worker locally (`wrangler dev`) |
| `npm run typecheck` | Type-check every workspace |
| `npm run build:web` | Build the frontend for production |
| `npm run db:migrate:local` | Apply D1 migrations to the local dev DB |
| `npm run db:migrate:remote` | Apply D1 migrations to the remote D1 DB |
| `npm run deploy:api` / `deploy:web` | Deploy a service to Cloudflare |

## Before first deploy

1. `cd apps/api && npx wrangler d1 create site-web-db` and paste the returned
   `database_id` into `apps/api/wrangler.jsonc`.
2. `npm run db:migrate:remote` to create the schema on the remote DB.
3. `npm run deploy:api` then `npm run deploy:web`.

## Conventions

- **Database migrations must be idempotent.** Use `CREATE TABLE IF NOT EXISTS` /
  `CREATE INDEX IF NOT EXISTS`. Never add the same column in both `schema.sql` and a
  migration `ALTER TABLE` in one commit. Keep each `ALTER TABLE ADD COLUMN` in its
  own small migration file (D1 `--file` runs are transactional — one error rolls back
  the whole file). SQLite/D1 has no `ADD COLUMN IF NOT EXISTS`.
- Keep the frontend free of secrets. Anything sensitive lives in the Worker
  (`wrangler secret put ...`), never in `apps/web`.
- `compatibility_date` is pinned in each `wrangler.jsonc`; bump deliberately.
