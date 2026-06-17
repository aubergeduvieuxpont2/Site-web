# Site-web

A full-stack web application running on Cloudflare — a Svelte/Vite single-page
frontend styled with Tailwind CSS, and a Hono Worker API backed by Neon Postgres.

## Stack

- **Frontend:** Svelte 5 + Vite + TypeScript + Tailwind CSS v4, served from a Cloudflare Worker.
- **Backend:** Cloudflare Worker (Hono) + Neon Postgres (`@neondatabase/serverless`).
- **Tooling:** npm workspaces, Wrangler.

## Layout

```
apps/
  web/   Frontend SPA (apps/web)
  api/   HTTP API Worker + Neon Postgres (apps/api)
```

## Getting started

```bash
npm install

# Configure the database: copy the example and paste your Neon connection string.
cp .dev.env.example .dev.env
# edit .dev.env and set DB_CONN=postgresql://...-pooler...?sslmode=require

# Create the schema
npm run db:migrate

# Run the API locally (loads .dev.env automatically)
npm run dev:api      # http://localhost:8787

# In another terminal, run the frontend
npm run dev:web      # http://localhost:5173
```

## Deploying

```bash
# One-time: store the Neon connection string as a Worker secret
cd apps/api && npx wrangler secret put DB_CONN && cd ../..

npm run db:migrate    # ensure the remote schema is up to date
npm run deploy:api
npm run deploy:web
```

See [CLAUDE.md](./CLAUDE.md) for architecture notes and conventions.
