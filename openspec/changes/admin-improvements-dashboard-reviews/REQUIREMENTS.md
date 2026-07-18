# Requirements — Admin & Product Improvements

## In Scope

### Functional Requirements

**WS-A — Admin UX (§1–3) + toggle wiring**
- FR-A1 (MUST) The admin tab nav (`.page-admin__tabs-inner`) MUST hide its
  horizontal scrollbar (`scrollbar-width: none` + `::-webkit-scrollbar
  { display:none }`) while keeping `overflow-x: auto`, and MUST fit the full tab
  row + Courriels link without overflow at 1280px and 1024px.
- FR-A2 (MUST) The Paramètres settings panel MUST be extracted into
  `AdminParametresTab.svelte` rendered as five grouped cards (Tarification &
  taxes / Coordonnées / Réservations / Courriels automatiques / Sécurité) with a
  single save button; the password change MUST keep its own button/call.
- FR-A3 (MUST) A shared `Modal.svelte` MUST be extracted (portal to `<body>`,
  `role="dialog"`, focus trap, Escape + backdrop close, focus return) and
  `RoomAssignmentDrawer` MUST be refactored onto it without behavior change.
- FR-A4 (MUST) The reservations table MUST show only Nom·Arrivée·Départ·
  Chambres·Statut·Actions; a row click and Enter/Space MUST open a detail modal
  containing the reservation code, removed fields, Facture panel, and Chambres
  assignment; Confirmer/Annuler MUST remain in-row and MUST NOT open the modal
  (`stopPropagation`) while still changing status.
- FR-A5 (MUST) `SETTINGS_DEFAULTS`, `SettingsUpdateSchema`, and the
  `AdminSettings` type MUST include `email_review_request_enabled` /
  `emailReviewRequestEnabled` (default false), seeded by migration 0037; the
  Paramètres "Courriels automatiques" card MUST expose it. It MUST NOT be public.

**WS-B — Blackout ranges (§4)**
- FR-B1 (MUST) `POST /api/admin/blackouts/range` MUST validate `startDate ≤
  endDate` and span ≤ 366 days, expand to one per-day `blackout_dates` upsert per
  inclusive day, and return `{count}`; invalid input MUST return 400.
- FR-B2 (MUST) `DELETE /api/admin/blackouts/range?start=&end=` MUST delete all
  rows in the inclusive span and return `{deleted}`.
- FR-B3 (MUST) Existing single-day GET/PUT/DELETE blackout endpoints and
  availability math MUST remain unchanged.
- FR-B4 (MUST) The UI MUST offer start/end pickers (end defaults to start) and
  MUST group consecutive days with identical `rooms_blocked` and `note` into one
  range row with a single (range) delete; grouping is display-only.

**WS-C — Dashboard (§5)**
- FR-C1 (MUST) `GET /api/admin/dashboard` (admin-gated) MUST return
  `guestsThisWeek`, `guestsLastWeek`, `next7Days[]`, `occupancy{currentMonth,
  previousMonth,sameMonthLastYear}`, and `returningCustomers` per the SPEC types.
- FR-C2 (MUST) Occupancy ratios MUST be `null` when the denominator
  (`assignableRoomCount × nights`) is 0 and the UI MUST render "—".
- FR-C3 (MUST) A new `AdminApercuTab.svelte` MUST be the default `activeTab`
  (Réservations second), rendering stat cards + a 7-day availability strip,
  responsive to a single column at 375px.

**WS-D — Reviews (§6)**
- FR-D1 (MUST) Migration 0038 MUST add `reservations.code`, backfill all
  existing rows with unique `AVP-XXXXXX` (Crockford base32, no 0/1/I/O), and
  enforce a unique index; new website + OTA inserts MUST set `code` with
  collision retry, preserving OTA dedupe.
- FR-D2 (MUST) `reviews` and `review_requests` tables MUST be created per the
  SPEC schema (one review per reservation via UNIQUE `reservation_id`).
- FR-D3 (MUST) `GET /api/reviews/eligibility` and `POST /api/reviews` MUST be
  public, rate-limited, and return generic responses for invalid codes; submit
  MUST compute masked `display_name` and snapshot `stays_count`/`nights_total`
  server-side, enforce rating 1–5 and body 10–2000 chars, and 409 on repeat.
- FR-D4 (MUST) The `scheduled` handler MUST, when `email_review_request_enabled`
  is true, enqueue a `review-request` email for confirmed reservations departed
  within the last 3 days with an email, no `review_requests` row, and no existing
  review; it MUST insert `review_requests` and MUST dedupe across runs. Link =
  `${SITE_ORIGIN}/avis/nouveau?code=<code>`.
- FR-D5 (MUST) Admin `GET /api/admin/reviews` (default pending, with
  `pendingCount`) and `PATCH /api/admin/reviews/:id` MUST support moderation and
  re-moderation; a new admin **Avis** tab MUST show a pending badge and
  approve/reject actions.
- FR-D6 (MUST) `GET /api/reviews` MUST return approved reviews only (masked, with
  `averageRating`); the homepage MUST render a strip of ≤3 (hidden when empty)
  and `/avis` MUST list all approved with an average header and a footer link.
- FR-D7 (SHOULD) The reservation code SHOULD appear in the admin detail modal;
  it MAY appear in confirmation email payloads (not required).

**Cross-cutting**
- FR-X1 (MUST) All migrations MUST be idempotent and numbered sequentially from
  0037, one schema change per file.
- FR-X2 (MUST) `index.ts` MUST preserve `export default { fetch, scheduled }` and
  `export { app }`.
- FR-X3 (MUST) New admin endpoints MUST use the inline `getAuthUser` +
  `role==='admin'` pattern (401 unauth, 403 non-admin).

### Non-Functional Requirements
- NFR-1 (Responsiveness) Every new/changed screen MUST render correctly at
  375px, 1024px, and 1280px (hard rule).
- NFR-2 (Security) Public review endpoints MUST be rate-limited on
  `cf-connecting-ip` and MUST NOT leak reservation data for invalid codes; raw
  guest identity MUST never be exposed publicly (masked `display_name` only).
- NFR-3 (Correctness) Dashboard SQL MUST be null-safe (no divide-by-zero) and
  review submission MUST be idempotent-safe (unique constraint → 409).
- NFR-4 (Compatibility) No new runtime dependencies; Crockford base32 built on
  `crypto.getRandomValues`; migration backfill uses only built-in `md5()`.
- NFR-5 (i18n/Style) French UI copy MUST match the existing admin style.
- NFR-6 (Testing) `npm run typecheck` MUST pass; all existing + new `apps/api`
  and `apps/web` Vitest suites MUST pass; new tests MUST cover the spec
  §"Error handling & testing" list.

### Constraints
- Storage for blackouts stays one-row-per-day; availability logic untouched.
- Neon Postgres over HTTP; migrations run via `scripts/migrate.mjs` before deploy.
- Existing recorder-based Neon stub for API tests; `@testing-library/svelte` +
  `vi.mock` for component tests.
- `SITE_ORIGIN` is the hardcoded `https://www.aubergeduvieuxpont.ca`.

## Out of Scope (Exclusions)
- SMS sending (`review_requests.channel` reserved only).
- Review replies, editing, or guest-side deletion.
- Historical occupancy charts beyond the three §5 ratios.
- Refactoring the remaining inline admin panels (the "File HubSpot" outbox tab).
- Any changes to the HubSpot service or `apps/email-ingest` internals.
- Adding the reservation code to confirmation emails is optional, not required.

## Acceptance Criteria
1. `.page-admin__tabs-inner` has no visible scrollbar and no horizontal overflow
   at 1280px/1024px; still scrollable at 375px.
2. Migration 0037 seeds `email_review_request_enabled='false'` idempotently;
   `emailReviewRequestEnabled` round-trips through admin settings GET/POST and is
   absent from public `GET /api/settings`.
3. Paramètres renders five grouped cards in order with one save button; password
   change is a separate call; existing settings behavior/tests unchanged.
4. `Modal.svelte` portals to `<body>`, traps focus, closes on Escape/backdrop,
   returns focus; `RoomAssignmentDrawer` uses it and its tests pass.
5. Reservations table shows the six compact columns; row/Enter/Space opens the
   detail modal (code + removed fields + Facture + Chambres); Confirmer/Annuler
   change status without opening the modal.
6. `POST /api/admin/blackouts/range` creates exactly span-length per-day rows
   (`{count}`), rejects `start>end` and span>366 with 400; `DELETE …/range`
   removes the span (`{deleted}`); single-day endpoints unchanged.
7. The disponibilités list groups consecutive identical days into one range row;
   adjacent-vs-overlapping and differing-attribute cases render as separate rows.
8. `GET /api/admin/dashboard` returns the five fields with correct week/occupancy/
   returning-customer math; null occupancy when denominator 0; 401/403 when not
   an admin.
9. Aperçu is the default tab, renders cards + 7-day strip, shows "—" for null
   occupancy, single-column at 375px; Réservations is second.
10. Every reservation (backfilled + new website/OTA) has a unique code matching
    `^AVP-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$`; unique index exists; 0038 is
    idempotent.
11. Eligibility returns `{eligible,firstName?}`/generic reason; submit creates a
    pending masked review with snapshot stays/nights, enforces rating 1–5 &
    body 10–2000, 409 on repeat.
12. Admin reviews list filters by status (default pending) with pendingCount;
    PATCH toggles status + `moderated_at`; re-moderation allowed.
13. With the toggle on, cron enqueues one `review-request` per eligible departed
    reservation, inserts `review_requests`, dedupes across runs, and links
    `${SITE_ORIGIN}/avis/nouveau?code=<code>`; with it off, none enqueue.
14. `GET /api/reviews` returns approved-only masked reviews + `averageRating`;
    homepage strip shows ≤3 and nothing when empty; `/avis` lists all approved
    with average header; footer links to `/avis`.
15. `npm run typecheck` and all Vitest suites pass; `index.ts` keeps both exports.
