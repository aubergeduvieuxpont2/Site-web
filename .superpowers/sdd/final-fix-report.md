# Final whole-branch review fixes — report

Branch: `agent/20260718-153000` (worktree `/Users/ychasse/Downloads/wt-admin-final`)

Verification gate: `npm run typecheck` → **0 errors**; `npm test --workspace apps/api` → **619 passed** (was 617, +2); `npm test --workspace apps/web` → **1166 passed** (was 1158, +8). Net test count grew by 10; no migrations touched; French copy unchanged.

---

## IMPORTANT-1 — Aperçu is now the DEFAULT admin tab

**Change:** `apps/web/src/routes/admin/+page.svelte:45` — `activeTab` initial `$state` literal changed `"reservations"` → `"apercu"`. The `tab-apercu`/`panel-apercu` already render first and the panel lazily mounts `<AdminApercuTab />`, so no markup changes were needed.

**Tests added:**
- `apps/web/src/routes/__tests__/page-admin.test.ts` — new `describe("page-admin default tab")` asserting the default-selected tab is `tab-apercu` (`aria-selected=true`), `panel-apercu` is visible while `panel-reservations` is `hidden`, and the `admin-apercu-tab` content mounts. The mock now also provides `adminGetDashboard` (added to the `$lib/api` mock + a `beforeEach` default payload) so the default panel renders.
- New component test file **`apps/web/src/lib/components/admin/__tests__/AdminApercuTab.test.ts`** (7 tests): stat cards render from a mocked `DashboardResponse` (`guestsThisWeek`, `occupancy.currentMonth` → `62 %`, `returningCustomers`); null occupancy ratio renders `—`; the 7-day strip renders exactly 7 `avail-row`s (plus empty-state); error + network-error banners. Follows the existing `@testing-library/svelte` + `vi.mock("$lib/api")` pattern (mirrors `AdminAvisTab.test.ts` / `page-admin.test.ts`).

**Existing tests updated to the NEW behavior (noted per instructions):** the two `page-admin ARIA tab semantics` tests assumed `tab-reservations` was default-selected and that ArrowRight starts from reservations → outbox. Rewritten to start from `tab-apercu` (Aperçu is index 0 in the roving order; ArrowRight → reservations).

**RED/GREEN evidence** (temporarily reverting the default to `"reservations"`):
```
❯ src/routes/__tests__/page-admin.test.ts (24 tests | 3 failed)
   × page-admin default tab > opens on the Aperçu tab/panel by default (not Réservations)
     → expected 'false' to be 'true'
   × page-admin ARIA tab semantics > marks the active tab with aria-selected and roving tabindex
     → expected 'false' to be 'true'
   × page-admin ARIA tab semantics > moves between tabs with ArrowRight/ArrowLeft
     → expected 'false' to be 'true'
```
GREEN after restoring `"apercu"`: the 4 affected web files run 82 passed (0 failed).

---

## IMPORTANT-2 — Dead duplicate modules consolidated to one source of truth

`apps/api/src/index.ts` now imports the tested modules instead of shipping inline copies:
- Added `import { generateCode } from "./reservationCode";` and `import { enqueueReviewRequests } from "./reviewRequests";`.
- Deleted the inline `CODE_ALPHABET` const and inline `generateReservationCode()`. `insertReservationCode()` (the index-specific DB-UPDATE wrapper, which the module does not duplicate) now calls the module's `generateCode()`. Code generation for the shipping path now flows through `reservationCode.ts`, so its `generateCode` unit tests cover production.
- Deleted the entire inline `enqueueReviewRequests(env)` implementation. The scheduled handler now calls the module version: `await enqueueReviewRequests(neon(env.DB_CONN));` (signature adapted `env` → `sql` — the module reads the toggle via `SELECT value FROM settings WHERE key = 'email_review_request_enabled'`).

`reservationCode.test.ts` and `reviewRequests.test.ts` are now exercised by the shipping path and remain green.

---

## IMPORTANT-3 — Review-request email payload now includes dates

Consolidating per IMPORTANT-2 replaces the old inline payload `{ firstName, reviewUrl }` (which made `review-request.{fr,en}.hbs` `{{formatDate checkIn}}` render blank / throw) with the module's correct `{ firstName, checkIn: arrive, checkOut: depart, reviewUrl }`.

**Test added** to `apps/api/src/reviewRequests.test.ts`: `"enqueues a payload with firstName, reviewUrl, checkIn AND checkOut (INV-review-email-dates)"` — `toMatchObject` on all four keys + an exact key-set assertion.

**RED/GREEN evidence** (temporarily reverting the module payload to the old `{ firstName, reviewUrl }` shape):
```
❯ apps/api/src/reviewRequests.test.ts (21 tests | 2 failed)
   × includes checkIn and checkOut dates in the email payload
     → AssertionError: expected undefined to be '2026-07-10'
   × enqueues a payload with firstName, reviewUrl, checkIn AND checkOut (INV-review-email-dates)
     → to match object { … "checkIn": "2026-07-10", "checkOut": "2026-07-15" }
```
GREEN with the correct payload: 619 API tests pass.

---

## MINOR-A — publicRateLimit on GET /api/reviews

`apps/api/src/reviews.ts` — `router.get("/api/reviews", publicRateLimit, …)` (parity with `/api/reviews/eligibility` and `POST /api/reviews`). Test added to `reviewsRoutes.test.ts`: `"returns 429 when rate limit is exceeded (MINOR-A parity)"` (count=31 > 30). The existing `GET /api/reviews` tests stay green because `rateLimitAllow` fails open / counts 0 under their SQL mocks.

## MINOR-B — Removed dead truncateMessage

Deleted `MESSAGE_LIMIT` + `truncateMessage()` from `apps/web/src/lib/components/admin/ReservationTableRow.svelte` (the Message column no longer exists). Removed its import, the 3-test `describe("truncateMessage")` block, and the export-list source assertion in `ReservationTableRow.test.ts`; added a source assertion that `truncateMessage` is no longer present.

## MINOR-C — dialogTestid prop on Modal

`apps/web/src/lib/components/Modal.svelte` — new `dialogTestid?: string` prop (default `"modal-dialog"`), mirroring `backdropTestid`; the dialog panel now uses `data-testid={dialogTestid}`. The nested `RoomAssignmentDrawer.svelte` Modal (which stacks inside `ReservationDetailModal`'s Modal) passes `dialogTestid="rad-dialog"` so a query for `modal-dialog` never matches two panels at once. Two tests added to `Modal.test.ts` (default id present; custom id forwarded and default absent).

---

## Full verification output (tails)

`npm run typecheck` (all workspaces):
```
> @site-web/api@0.0.0 typecheck  → tsc --noEmit
> @site-web/web@0.0.0 typecheck  → svelte-check
COMPLETED 518 FILES 0 ERRORS 19 WARNINGS 5 FILES_WITH_PROBLEMS
```
(19 warnings are all pre-existing `state_referenced_locally` / unused-CSS notices, none in changed files' logic.)

`npm test --workspace apps/api`:
```
 Test Files  34 passed (34)
      Tests  619 passed (619)
```

`npm test --workspace apps/web`:
```
 Test Files  67 passed (67)
      Tests  1166 passed (1166)
```
