# A/B Deploy Workflows — Design

**Date:** 2026-06-18
**Status:** Approved

## Problem & Objective

Stakeholders need an A/B concept-testing surface to approve design direction and capture
preferences — without touching production (`www`). We want three GitHub Actions that deploy
this Cloudflare Workers monorepo: one for production, and one each for two experimental
front-end variants (path A / path B), with real edge traffic-splitting between the variants
on a dedicated `dev` surface.

## Surfaces

| Surface | Host | Worker | Source branch |
|---|---|---|---|
| Production | `www.aubergeduvieuxpont.ca` | `site-web-web` (+ `site-web-api`) | `main` |
| A/B experiment | `dev.aubergeduvieuxpont.ca` | `site-web-ab-splitter` | `main` |
| Variant A | `a.aubergeduvieuxpont.ca` | `site-web-web-a` | `path-a` |
| Variant B | `b.aubergeduvieuxpont.ca` | `site-web-web-b` | `path-b` |

Production (`www`) is unchanged by the experiment. The API Worker (`site-web-api`) is shared
across all surfaces.

## Components

### 1. Splitter Worker (`apps/ab-splitter`)
- Route `dev.aubergeduvieuxpont.ca/*`. Pure Worker (no static assets).
- Per request: read the `ab_variant` cookie. If absent, assign `a` with probability
  `WEIGHT_A`% (var, default 50), else `b`; set a 30-day `Set-Cookie` (Path=/, SameSite=Lax).
- Forward the request by **fetch** to `https://a.` or `https://b.` + original path + query, and
  return the upstream response (with the assignment cookie added for new visitors).
- `/api/*` on `dev` is NOT handled here — a more-specific `dev.../api/*` route sends it
  straight to the shared API, keeping reservation POSTs same-origin.
- **Fetch-based forwarding (not service bindings)** so the splitter deploys even if a variant
  Worker doesn't exist yet (no deploy-order coupling).

### 2. Variant Web Workers (wrangler environments in `apps/web/wrangler.jsonc`)
- `env.a` → name `site-web-web-a`, route `a.aubergeduvieuxpont.ca/*`.
- `env.b` → name `site-web-web-b`, route `b.aubergeduvieuxpont.ca/*`.
- Same SPA build as prod; the *content* differs because each variant is built from its own
  branch (`path-a` / `path-b`). Variant workflows run `wrangler deploy --env a|b`.

### 3. Shared API routes + CORS (`apps/api`)
- Add routes `dev.../api/*`, `a.../api/*`, `b.../api/*` alongside `www.../api/*`.
- Add `https://dev.`, `https://a.`, `https://b.` to the CORS allowlist (defensive; surfaces
  are same-origin so CORS isn't normally triggered).

### 4. GitHub Workflows (`.github/workflows`)
- `deploy-prod.yml` — trigger: push to `main` + `workflow_dispatch`. Steps: checkout →
  setup-node → `npm ci` → `npm run typecheck` → `npm run build:web` → deploy `site-web-api`,
  `site-web-web` (www), and `site-web-ab-splitter` (dev).
- `deploy-path-a.yml` — trigger: push to `path-a` + `workflow_dispatch`. Steps: checkout →
  setup-node → `npm ci` → typecheck → `npm run build:web` → `wrangler deploy --env a`.
- `deploy-path-b.yml` — same, for `path-b` / `--env b`.
- Auth: repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (account `525ee8d6`,
  the aubergeduvieuxpont.ca account). The API Worker's `DB_CONN` secret already lives on the
  Worker and persists across deploys — workflows never need it.

## Data Flow (experiment)

```
visitor → dev.aubergeduvieuxpont.ca/* → splitter
   ├─ cookie ab_variant=a → fetch https://a.aubergeduvieuxpont.ca/<path> → return
   └─ cookie ab_variant=b → fetch https://b.aubergeduvieuxpont.ca/<path> → return
visitor → dev.aubergeduvieuxpont.ca/api/* → (more-specific route) → site-web-api → Neon
```

## Error Handling
- Splitter: if the chosen variant fetch fails (variant not yet deployed / 5xx), return a 502
  with a short plain-text notice rather than throwing.
- Workflows: `wrangler deploy` non-zero exit fails the job; typecheck/build gate the deploy.

## Out of Scope
- Per-variant databases (variants share the prod API + Neon DB; reads/writes are identical).
- Promoting a winning variant to prod (manual: merge the chosen branch to `main`).
- Analytics/metrics on the split (cookie assignment only; measurement added later if needed).

## Verification
- Merge to `main` → `deploy-prod` green; `www` unchanged; `dev/api/health` 200.
- Push `path-a` / `path-b` → variant workflows green; `a.`/`b.` serve their SPA.
- `dev` repeatedly fetched with fresh cookie jars → both variants observed; with a fixed
  cookie → sticky to one variant.
- `dev` reservation POST → 201 (same-origin via the shared API).
