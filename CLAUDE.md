# Site-web

Full-stack web application deployed on **Cloudflare**. Service-based monorepo: an
independently deployable frontend and backend API communicating over HTTP.

## Architecture

```
apps/
  web/   Svelte 5 + Vite SPA styled with Tailwind CSS v4, served by a Cloudflare Worker (static assets).
  api/   Hono Worker (the HTTP API) backed by a Neon Postgres database.
  email-ingest/  Email Worker: receives OTA booking emails (bookings@) via
                 Cloudflare Email Routing, forwards the original, parses
                 Airbnb/Expedia confirmations and posts them to the API's
                 internal /internal/ota-bookings endpoint (service binding).
```

- **Frontend** (`apps/web`) is a static SPA. It calls the API over HTTP (`/api/*`).
- **Backend** (`apps/api`) is a Cloudflare Worker using [Hono](https://hono.dev).
  Persistent data lives in **Neon Postgres**, reached with the
  [`@neondatabase/serverless`](https://github.com/neondatabase/serverless) driver
  over HTTP. The connection string is the `DB_CONN` var/secret on `c.env` — there
  is **no** Cloudflare binding block for it.
- The two services deploy independently; treat the HTTP boundary as the contract.
- **Email ingest** (`apps/email-ingest`) is a Cloudflare Email Worker that ingests
  OTA booking confirmations, creates reservations (with dedupe via `source`/`external_ref`
  on the `reservations` table), and logs all processed emails to the `email_ingest_log`
  table for admin visibility.

## Database config (DB_CONN)

- **Local dev:** `DB_CONN` lives in the repo-root `.dev.env` (gitignored). The API
  `dev` script loads it via `wrangler dev --env-file ../../.dev.env`, and the
  migration runner reads it from the same file. See `.dev.env.example`.
- **Production:** set it as a Worker secret: `cd apps/api && npx wrangler secret put DB_CONN`.
- Use Neon's **pooled** connection string (host contains `-pooler`) with `sslmode=require`.

## Common commands

Run from the repo root (npm workspaces):

| Command | What it does |
|---|---|
| `npm install` | Install all workspace dependencies |
| `npm run dev:web` | Run the frontend dev server (Vite) |
| `npm run dev:api` | Run the API Worker locally (loads `.dev.env`) |
| `npm run typecheck` | Type-check every workspace |
| `npm run build:web` | Build the frontend for production |
| `npm run db:migrate` | Apply Postgres migrations to the `DB_CONN` database |
| `npm run deploy:api` / `deploy:web` | Deploy a service to Cloudflare |

## Before first deploy

1. Create a Neon project + database and copy the pooled connection string into
   `apps/api` config: `npx wrangler secret put DB_CONN` (and into local `.dev.env`).
2. `npm run db:migrate` to create the schema (runs against `DB_CONN`).
3. `npm run deploy:api` then `npm run deploy:web`.

## Conventions

- **Database migrations must be idempotent.** Use `CREATE TABLE IF NOT EXISTS` /
  `CREATE INDEX IF NOT EXISTS`. Postgres also supports
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Keep each schema change in its own
  numbered file in `apps/api/migrations/`; the runner (`scripts/migrate.mjs`)
  applies every file in order on each run.
- Keep the frontend free of secrets. Anything sensitive (including `DB_CONN`)
  lives in the Worker, never in `apps/web`.
- `compatibility_date` is pinned in each `wrangler.jsonc`; bump deliberately.

## Configurable Settings

Four volatile business facts are managed via a `settings` Postgres table (created in
`migrations/0007_settings.sql`) and exposed through the API:

| Key | Type | Default | Visibility |
|---|---|---|---|
| `nightly_price` | number | 89 | Public |
| `contact_email` | string | `info@aubergeduvieuxpont.ca` | Public |
| `marketing_room_count` | number | 12 | Public |
| `assignable_room_count` | number | 12 | Admin only |

**Frontend fallbacks** (`apps/web/src/lib/content.ts`):
- `SITE.email` and `SITE.citq` are static constants (non-configurable).
- `DEFAULTS` exports the three public setting defaults (`nightlyPrice`,
  `contactEmail`, `marketingRoomCount`) for graceful fallback when the API is
  unreachable or a settings row is missing.
- `ROOMS` array now contains only 3 rooms (dortoir removed) with no per-room pricing;
  all rooms display the flat nightly price from settings.

**API boundaries**:
- `GET /api/settings` returns the three public settings (no `assignableRoomCount`).
- `GET /api/admin/settings` and `POST /api/admin/settings` are admin-gated and
  include all four keys. The update body (camelCase) validates all four as positive
  integers with a valid email.
- Settings default to 89 $, and the site gracefully renders these defaults when the
  database is unreachable.
