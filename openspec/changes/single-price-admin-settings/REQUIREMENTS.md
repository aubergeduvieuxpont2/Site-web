# Requirements — Single Price + Admin-Configurable Settings

## In Scope

### Functional Requirements

- **FR-1 (MUST)** — No room-selection path. `RoomCard` "Réserver" links to `/contact`
  with no `?chambre=` query. The contact page MUST drop the chambre-prefill `$effect`,
  the "Chambre souhaitée" seed text, and the "chambre souhaitée" placeholder wording.
- **FR-2 (MUST)** — Remove the `dortoir-equipe` room from `ROOMS` and purge every
  dortoir/dormitory mention from copy (STATS, POLICIES P-05, a-propos value card,
  le-site heading) and from tests.
- **FR-3 (MUST)** — A single flat nightly price applies to every room. Per-room
  `priceFrom`/`pricePerNight` display MUST be removed; the flat price is shown wherever
  pricing appears. The price MUST be stored server-side and editable from the admin
  panel. Default **89 $ CAD/night**.
- **FR-4 (MUST)** — The public contact email MUST be admin-configurable, default
  `info@aubergeduvieuxpont.ca`. The hardcoded `aubergeduvieuxpont@hotmail.com` (SITE.email
  and PRIVACY C-03) MUST be removed; the site renders the configured value with the
  default as fallback.
- **FR-5 (MUST)** — Two admin-configurable room counts: (a) a **marketing count**
  displayed on the site (default 12, exposed publicly) and (b) an **assignable capacity**
  (default 12, admin-only, NEVER on the public endpoint). Site copy referencing bed/room
  counts MUST use the marketing count.
- **FR-6 (MUST)** — `CITQ #304542` MUST be visible in the footer on every page,
  non-configurable, with a `data-testid`.
- **FR-7 (MUST)** — Every "Hydro-Québec" mention in web copy MUST be replaced with
  generic hydro-worker phrasing (French) so no affiliation is implied.
- **FR-8 (MUST)** — `SITE.tagline` MUST convey "no luxury, functional comforts".
- **FR-9 (MUST)** — 24/7 monitoring claims ("surveillé jour et nuit", "stockage
  surveillé") MUST be reworded to secure/locked storage without a surveillance promise.
- **FR-10 (MUST)** — New idempotent migration `0007_settings.sql` creates a key/value
  `settings` table and seeds the four default rows; re-running is a no-op.
- **FR-11 (MUST)** — `GET /api/settings` (public) returns nightly price, contact email,
  and marketing room count only. `GET`/`POST /api/admin/settings` are admin-gated
  (`401`/`403`); the update body is validated with `zValidator` + custom hook (`400` on
  invalid), never manual `c.req.json()`.
- **FR-12 (MUST)** — A "Paramètres" tab in the admin panel (existing ARIA-tabs pattern)
  loads and saves the four settings with validated inputs.
- **FR-13 (SHOULD)** — A client-side settings store hydrates public pages from the API,
  with `content.ts` constants as the graceful fallback on fetch failure.
- **FR-14 (MUST)** — Co-located vitest tests asserting removed/changed copy or behavior
  are updated; new tests cover the settings module, the settings loader/api helpers, the
  admin settings tab, and the footer CITQ line.

### Non-Functional Requirements

- **NFR-1 (Correctness)** — `npm run typecheck`, `npm run build:web`, and the full vitest
  suite (web + api) MUST pass. Any defect found — including pre-existing — MUST be fixed,
  not worked around.
- **NFR-2 (Idempotency)** — Migrations MUST be idempotent; each schema change in its own
  numbered file.
- **NFR-3 (Localization)** — All user-facing copy is French (Québec) with correct accents.
- **NFR-4 (Responsiveness)** — Design system, layout, and mobile+desktop responsiveness
  preserved; stable `data-testid`s unchanged (new testids additive).
- **NFR-5 (Security)** — Frontend stays secret-free (settings in Postgres, no env vars).
  The assignable capacity is never exposed on the public endpoint. Admin writes require
  `role === "admin"`. User-supplied values are parameterized (Neon tagged templates) and
  validated by zod.
- **NFR-6 (Availability)** — Public pages render correctly when the API is unreachable
  (defaults) and before the settings table exists (API returns defaults for missing rows).

## Out of Scope (Exclusions)

- No change to the reservation submission flow (name/email/dates/guests/message) beyond
  removing the `?chambre=` prefill; the API `reservations.room` column is untouched.
- No redesign or new pages; the admin UI reuses the existing tabs pattern.
- No changes to the HubSpot gateway, the auth/session model, or CORS origins.
- No deploy; the operator sets production values and deploys after review.
- `assignable_room_count` is not surfaced anywhere on the public site.
- Making the confidentialité (PRIVACY C-03) email dynamically configurable is out of
  scope; its default text is updated to `info@aubergeduvieuxpont.ca` (the contact page is
  the dynamic render point for the configured email).

## Acceptance Criteria

1. SSR-rendered `RoomCard` CTA `href` is exactly `/contact`; `?chambre=` appears nowhere.
2. `contact/+page.svelte` has no `?chambre` read, no "Chambre souhaitée" text, and a
   placeholder without "chambre souhaitée".
3. `grep -ri "dortoir" apps/web/src` finds no product-copy match; `ROOMS` has no
   `dortoir-equipe`; three rooms remain.
4. SSR-rendered `RoomCard` shows `89 $/nuit`; no per-room `priceFrom`/`pricePerNight`
   value is rendered.
5. `GET /api/settings` returns `{ nightlyPrice, contactEmail, marketingRoomCount }` and
   NOT `assignableRoomCount`.
6. `GET /api/admin/settings` and `POST /api/admin/settings` return `401` without a
   session and `403` for a non-admin; a valid-admin `POST` with negative price or invalid
   email returns `400`.
7. After a valid admin `POST`, a later `GET /api/settings` reflects the updated values.
8. `grep -ri "hotmail" apps/web/src` finds no match; the contact page renders
   `settings.contactEmail` (default `info@aubergeduvieuxpont.ca`).
9. The admin "Paramètres" panel exposes `input-marketing-rooms` and
   `input-assignable-rooms`; only marketing count is in `GET /api/settings`.
10. The Accueil stats strip renders exactly four `stat-item`s; one shows the marketing
    room count (default `12`) with a "chambres" suffix.
11. The Footer renders `data-testid="footer-citq"` containing `CITQ #304542` on every
    page.
12. `grep -r "Hydro-Québec" apps/web/src` finds no product-copy match.
13. `SITE.tagline` no longer equals "L'utilité industrielle rencontre l'hospitalité
    rurale." and conveys "no luxury, functional comforts".
14. `grep -rE "surveillé jour et nuit|stockage surveillé" apps/web/src` finds no match.
15. `npm run typecheck`, `npm run build:web`, and the full vitest suite pass.
16. Applying `0007_settings.sql` twice succeeds and leaves exactly one row per key.
