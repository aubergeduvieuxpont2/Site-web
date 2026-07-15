# Understanding Brief

## Problem & Objective

The L'Auberge du Vieux Pont marketing site (`apps/web` Svelte 5 SPA + `apps/api` Hono
Worker on Neon Postgres) currently misrepresents the auberge's real operating model: it
lets guests pick specific rooms at per-room prices, advertises a dormitory that doesn't
exist, implies a Hydro-Québec affiliation, and hard-codes business facts (email, counts,
price) in `content.ts`. The operator wants the site to reflect reality — rooms assigned at
arrival, one flat nightly price, 12 rooms, generic hydro-worker positioning — and to make
the volatile business facts (price, contact email, room counts) editable from the existing
admin panel instead of requiring a code deploy.

## Scope

**In scope**

- **Copy/content edits in `apps/web/src/lib/content.ts`** and the route/component files that
  render it (`+page.svelte`, `a-propos`, `le-site`, `contact`, `RoomCard.svelte`, `Footer.svelte`):
  - #1 Remove room-selection: drop `?chambre=<slug>` from `RoomCard` CTA (`contactHref`),
    remove the contact page `?chambre=` prefill effect + "Chambre souhaitée" seed text (and
    reword the message placeholder that says "chambre souhaitée"). Rooms may still be shown
    as illustrative examples — no per-room booking path.
  - #2 Remove `dortoir-equipe` from `ROOMS`; purge dortoir mentions in STATS, POLICIES P-05,
    a-propos ("Du dortoir à 39 $…"), le-site heading ("Nos chambres et dortoirs").
  - #3 Remove per-room price (`priceFrom`/`pricePerNight` display); show one flat price.
  - #4 Contact email: render configured value (default `info@aubergeduvieuxpont.ca`),
    replacing `SITE.email` (`aubergeduvieuxpont@hotmail.com`) and PRIVACY C-03.
  - #6 Add non-configurable "CITQ #304542" to `Footer.svelte` (renders on every page).
  - #7 Replace all "Hydro-Québec" mentions (content.ts header comment + A-08; `+page.svelte`
    hero; a-propos ×2 lines 84 & 206; le-site line 144) with generic hydro-worker phrasing.
  - #8 Replace `SITE.tagline` with a "no luxury, functional comforts" line.
  - #9 Remove 24/7 monitoring claims: AMENITIES A-01 "surveillé jour et nuit" and STATS
    "24 h — stockage surveillé" reworded to secure/locked without surveillance promise.
- **Admin-configurable settings** (#3, #4, #5): new Postgres `settings` table + API endpoints
  (public GET, authenticated admin update), a new "Paramètres" section in the admin panel
  (`apps/web/src/routes/admin/+page.svelte`), new typed helpers in `apps/web/src/lib/api.ts`,
  and a client-side loader so public pages render the configured values with the content.ts
  constants as fallback. Four settings: flat **nightly price** (default 89 $ CAD), **contact
  email** (default `info@aubergeduvieuxpont.ca`), **marketing room count** (default 12,
  drives site copy), and **assignable room capacity** (operational, default 12).
- Update every co-located vitest test asserting removed/changed copy or behavior (see
  Anticipated Next Steps for the concrete list). Fix any defect found, including pre-existing.

**Out of scope**

- No changes to the reservation submission flow itself (name/email/dates/guests/message) —
  only the `?chambre=` prefill is removed. The API `reservations.room` column stays.
- No redesign; design system, layout, responsiveness, and stable data-testids preserved.
- No deploy — operator deploys after review. No changes to HubSpot gateway or auth model.

## Success Criteria

- No path anywhere lets a guest choose a room; RoomCard "Réserver" links to `/contact` with
  no query string; contact page has no chambre prefill or "chambre souhaitée" wording.
- Grep for `dortoir`/`Dortoir`, `Hydro-Québec`, `hotmail`, `surveillé jour et nuit`,
  `stockage surveillé`, and `?chambre=` across `apps/web/src` returns zero product-copy hits.
- One flat nightly price is shown wherever pricing appears; changing it in the admin panel
  changes what the public site displays (via the public settings endpoint), no redeploy.
- Contact email, marketing room count, and price all read from settings with correct defaults
  when the API is unreachable; admin edits persist across reloads.
- "CITQ #304542" is visible in the footer on every page.
- Tagline conveys "no luxury, functional comforts"; hydro copy is generic (no HQ affiliation).
- `npm run typecheck`, `npm run build:web`, and the **full** vitest suite pass; a new
  idempotent migration creates the `settings` table + seeds defaults and re-runs cleanly.

## Key Decisions

1. **Settings storage shape — recommend a key/value `settings` table** (`key TEXT PRIMARY KEY,
   value TEXT NOT NULL, updated_at TIMESTAMPTZ`), seeded with `INSERT … ON CONFLICT (key) DO
   NOTHING` in a new numbered migration (`apps/api/migrations/0007_settings.sql`). This fits
   the idempotency convention better than typed columns and lets new settings be added without
   schema churn. The Planner should confirm key/value vs. a single-row typed table.
2. **Public vs. authenticated read boundary.** The public GET (`/api/settings`) should expose
   only the site-facing values: **nightly price, contact email, marketing room count**. The
   **assignable capacity** (#5b) is operational — the requirement calls it "rooms assignable to
   customers … may be lower when rooms are held back" — and should be readable/writable only
   through the authenticated admin surface, not leaked publicly. Confirm this split.
3. **Admin auth reuses the existing session-cookie + role model.** The update endpoint must
   check `getAuthUser(c)` → `role === "admin"` (401/403 like the other `/api/admin/*` routes)
   and MUST validate its body with `zValidator` + a custom error hook — never manual
   `c.req.json()` — per the established repo rule (see `[[hono-zvalidator-rule]]`).
4. **How the SPA consumes settings.** `content.ts` constants stay as the source of default
   values; add a small client-side settings store/loader that fetches the public endpoint and
   overrides the defaults, so prerendered/SSR pages render defaults first and hydrate the
   configured values on the client (with defaults as the graceful fallback on fetch failure).
5. **STATS "32 lits" semantics (#5).** "32 lits" (beds) conflicts with "12 rooms" and with the
   dormitory removal. Recommend converting this stat to a **rooms** stat driven by the marketing
   count (e.g. `12` + suffix `" chambres"`), keeping the `stat-item`/`stat-number` testids and
   the 4-stat layout intact so `page-accueil.test.ts` still finds four items.
6. **Value types & validation.** Nightly price = positive integer CAD; room counts = positive
   integers; email = valid address. Reject invalid admin updates via the zod schema.
7. **Testid stability.** Keep `room-card-price`, `stat-item`/`stat-number`, `footer-*`, and
   admin tab testids. Add a new testid for the footer CITQ node and for the new admin settings
   tab/panel/inputs; add a `tab-settings` alongside `tab-reservations`/`tab-outbox`.

## Recommendations Adopted

- Single key/value `settings` table + `0007_settings.sql` migration with `ON CONFLICT DO
  NOTHING` seeds; public GET returns the three site-facing keys, admin PUT/POST updates all
  four behind role gating and `zValidator`.
- Convert the beds stat to a settings-driven rooms stat; keep all four stat slots.
- Default nightly price **89 $ CAD/night** (documented in the migration and/or CLAUDE.md).
- Client settings loader with content.ts constants as the fallback source of truth.
- Add a "Paramètres" tab to the admin panel following the existing ARIA-tabs pattern, so the
  new UI matches the design system rather than introducing a new page.

## Anticipated Next Steps

- **Update these tests to match** (they currently assert removed copy/behavior): `RoomCard.test.ts`
  (dortoir name, `pricePerNight: 39`/`149`, `?chambre=` CTA assertions at lines ~108–115),
  `page-contact.test.ts` (`?chambre=` seed test ~73–74), `page-le-site.test.ts` (room-card count
  ~86, "Nos chambres et dortoirs" ~92), `page-accueil.test.ts` (stat labels), plus any a-propos
  copy assertions. Add new tests for the settings API/loader, the admin settings tab, and the
  footer CITQ line. Add an `api/test` case for the settings endpoints (public GET + admin gating).
- **Run `npm run db:migrate`** against `DB_CONN` after adding `0007_settings.sql` so the
  `settings` table + defaults exist before the site tries to read them (operator does this in
  prod as part of their deploy).
- **Operator action after merge:** log into the admin panel and set the real production values
  (price, contact email, marketing count, assignable capacity); then run the standard
  `deploy:api` + `deploy:web`. No secrets are added — settings live in Postgres, not env.
- **Document the 89 $ default and the new settings** in `CLAUDE.md`/migration comments so the
  next contributor knows where these business facts now live.
- Work happens on a **new branch off `main`**; do not deploy.
