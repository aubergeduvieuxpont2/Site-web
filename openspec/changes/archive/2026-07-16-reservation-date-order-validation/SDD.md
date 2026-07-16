# SDD — Reservation Date-Order Validation

## System Overview

Two independently deployed Cloudflare services participate:

- **`apps/api`** — a Hono Worker exposing `POST /api/reservations` (public). The
  request body is validated by `ReservationRequestSchema` (Zod) via
  `zValidator("json", …, reservationHook)` *before* the handler runs. This change
  adds a schema-level `superRefine` enforcing strict departure-after-arrival
  ordering, reusing `reservationDatesValid` from `apps/api/src/assignments.ts`.
- **`apps/web`** — a Svelte 5 SPA whose `contact/+page.svelte` renders the
  reservation form. A new pure helper `datesOutOfOrder` in `$lib/utils` backs an
  inline client-side field error and the departure input's `min` attribute.

The HTTP contract is unchanged: same endpoint, same request shape, same 400 JSON
error envelope produced by the existing `reservationHook`.

## Architecture Decisions

- **Schema-level `superRefine`, not handler logic.** Placing the check on the Zod
  schema keeps the failure path free of Neon/database access, reuses the existing
  helper verbatim, and makes rejection unit-testable through `safeParse` without
  mocking the database driver.
- **Reuse `reservationDatesValid`.** The helper already parses `YYYY-MM-DD` (and
  Date objects) and returns `false` for a missing or unparseable date and for
  `depart <= arrive`. The refine therefore guards on *both dates present* first,
  then treats a `false` result as an ordering violation — never making optional
  dates required.
- **One shared pure helper on the frontend.** `datesOutOfOrder` lives in
  `$lib/utils` and backs both `validateClient()` and its unit test, so no test
  asserts against `.svelte` source text.
- **Lexicographic comparison for the client helper.** Zero-padded `YYYY-MM-DD`
  strings sort chronologically, so `checkOut <= checkIn` is a correct and
  dependency-free order check on the client. The server keeps using
  `reservationDatesValid` (Date-based) for authority.
- **French copy parity.** The exact sentence
  `"La date de départ doit être postérieure à la date d'arrivée."` is used on both
  layers for a consistent user-facing message.
- **No migration.** Ordering is a pure validation concern; stored data is
  untouched and the change is backward compatible.

## Component Responsibilities

| Component | Responsibility | Change |
|---|---|---|
| `apps/api/src/index.ts` — `ReservationRequestSchema` | Validate reservation body | Add `superRefine` calling `reservationDatesValid`, error path `checkOut` |
| `apps/api/src/assignments.ts` — `reservationDatesValid` | Chronological order check | Reused verbatim (no change) |
| `apps/api/src/index.ts` — `reservationHook` | Map first Zod issue to 400 JSON | Unchanged; carries new message |
| `apps/web/src/lib/utils.ts` — `datesOutOfOrder` | Pure order check for the client | New export |
| `apps/web/src/routes/contact/+page.svelte` — `validateClient` | Inline field validation + `min` binding | Import helper, set `fieldErrors.checkOut`, bind checkout `min` |
| `apps/api/test/reservations.test.ts` | Schema behaviour | New `safeParse` cases |
| `apps/web/src/lib/__tests__/utils.test.ts` | Helper behaviour | New unit cases |

## Data Flow

**Server (authoritative):**

1. Client `POST /api/reservations` with JSON body.
2. `zValidator` parses with `ReservationRequestSchema`; `trimToNull` normalizes
   `checkIn`/`checkOut` to trimmed string or `null`.
3. `superRefine`: if either date is `null`, pass. If both present and
   `!reservationDatesValid(checkIn, checkOut)`, add a custom issue on path
   `["checkOut"]` with the French message.
4. On failure, `reservationHook` returns `400 { error: <message> }`; the handler
   body and Neon are never reached on that path.
5. On success, the handler runs unchanged (inserts the reservation, etc.).

**Client (pre-submit UX):**

1. User picks arrival/departure dates; the departure `<input min>` is bound to the
   chosen arrival, discouraging earlier picks in the native date UI.
2. On submit, `validateClient()` calls `datesOutOfOrder(form.checkIn,
   form.checkOut)`; if `true`, it sets `fieldErrors.checkOut` and blocks the
   request. Empty dates yield `false` (no error).

## Known Constraints

- **Optionality preserved.** Both layers must return valid/pass when either date
  is empty; correctness hinges on the both-present guard preceding the helper
  call.
- **Equal dates are invalid** (strict `>`): a same-day departure is rejected.
- **Client `min` is advisory.** Native date-input `min` is not a security control;
  the API refine is the authority. Both use the identical message string.
- **No stack/config changes**, no new dependencies, no migration; API and web
  deploy independently and this change is order-agnostic and backward compatible.
- **Timezone note (out of scope):** both dates are compared as calendar-date
  strings; no time-of-day or client-vs-server timezone reconciliation is added.
