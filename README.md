# Site-web

A full-stack web application running on Cloudflare — a Svelte/Vite single-page
frontend styled with Tailwind CSS, and a Hono Worker API backed by a D1 database.

## Stack

- **Frontend:** Svelte 5 + Vite + TypeScript + Tailwind CSS v4, served from a Cloudflare Worker.
- **Backend:** Cloudflare Worker (Hono) + D1 (SQLite).
- **Tooling:** npm workspaces, Wrangler.

## Layout

```
apps/
  web/   Frontend SPA (apps/web)
  api/   HTTP API Worker + D1 (apps/api)
```

## Getting started

```bash
npm install

# Run the API locally (creates a local D1 DB on first migrate)
npm run db:migrate:local
npm run dev:api      # http://localhost:8787

# In another terminal, run the frontend
npm run dev:web      # http://localhost:5173
```

## Deploying

```bash
# One-time: create the D1 database and paste its id into apps/api/wrangler.jsonc
cd apps/api && npx wrangler d1 create site-web-db && cd ../..

npm run db:migrate:remote
npm run deploy:api
npm run deploy:web
```

See [CLAUDE.md](./CLAUDE.md) for architecture notes and conventions.
