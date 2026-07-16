# Requirements — Reservation Date-Order Validation

## In Scope

### Functional Requirements

- **FR-1 (MUST)** — `ReservationRequestSchema` in `apps/api/src/index.ts` MUST
  reject a reservation body where both `checkIn` and `checkOut` are present
  (non-null after `trimToNull`) and `checkOut` is not strictly after `checkIn`
  (i.e. `checkOut <= checkIn`), via a `superRefine` calling the existing
  `reservationDatesValid(arrive, depart)` helper.
- **FR-2 (MUST)** — On rejection, the issue message MUST be exactly
  `"La date de départ doit être postérieure à la date d'arrivée."`, attached to
  path `["checkOut"]`, and MUST surface through the existing `reservationHook` as
  a `400` JSON response `{ "error": <message> }`.
- **FR-3 (MUST)** — The API MUST keep dates optional: a body with either or both
  of `checkIn`/`checkOut` empty or omitted MUST validate exactly as before (no new
  rejection). No DB/Neon access occurs on the ordering-failure path.
- **FR-4 (MUST)** — A new pure helper `datesOutOfOrder(checkIn, checkOut)` MUST be
  exported from `apps/web/src/lib/utils.ts`, returning `false` when either input
  is empty/nullish and `true` only when both are present and `checkOut <= checkIn`.
- **FR-5 (MUST)** — `validateClient()` in `apps/web/src/routes/contact/+page.svelte`
  MUST import and call `datesOutOfOrder`, and set `fieldErrors.checkOut` to the
  French sentence when it returns `true`; the `fieldErrors` type MUST include
  `checkOut?: string`.
- **FR-6 (MUST)** — The departure `<input>` on the contact page MUST bind its
  `min` attribute to `form.checkIn` (falling back to no constraint when empty).
- **FR-7 (MUST)** — API tests in `apps/api/test/reservations.test.ts` MUST cover:
  equal dates (reject), reversed dates (reject), ordered dates (accept), and
  empty/one-empty dates (accept).
- **FR-8 (MUST)** — A frontend unit test in `apps/web/src/lib/__tests__/` MUST
  exercise `datesOutOfOrder` directly for empty (valid), equal (invalid), reversed
  (invalid), and ordered (valid) inputs.
- **FR-9 (SHOULD)** — The inline checkout error SHOULD follow the existing
  field-error rendering pattern (`{#if fieldErrors.*}` block with `aria-describedby`
  wiring) and preserve the responsive `field-row` layout.

### Non-Functional Requirements

- **NFR-1 (MUST)** — The ordering-failure path MUST not add latency-bearing I/O
  (no database calls); validation is synchronous and in-memory.
- **NFR-2 (MUST)** — `npm run typecheck`, the API and web vitest suites, and
  `npm run build:web` MUST all pass with the new tests included and no regressions.
- **NFR-3 (MUST)** — The user-facing message MUST be identical on API and frontend
  for consistency.
- **NFR-4 (SHOULD)** — The change SHOULD remain surgical: no new dependencies, no
  config-file edits, no migrations.

## Out of Scope (Exclusions)

- Making dates required or adding min-nights / max-stay rules.
- Any change to admin room-assignment flows already using `reservationDatesValid`.
- Database migrations or schema changes (none needed).
- Timezone / client-vs-server calendar reconciliation.
- Refactoring unrelated validation or renaming `checkIn`/`checkOut` fields.

## Acceptance Criteria

- `safeParse` of a payload with equal `checkIn`/`checkOut` fails with the French
  message on path `["checkOut"]`.
- `safeParse` with reversed dates fails with the same message; with ordered dates
  succeeds; with both-empty and one-empty succeeds.
- `datesOutOfOrder` returns `false` for empty/one-empty inputs, `true` for equal
  and reversed pairs, and `false` for ordered pairs.
- The contact page imports `datesOutOfOrder` from `$lib/utils`, calls it in
  `validateClient`, and the checkout input has a `min` bound to `form.checkIn`.
- `npm run typecheck`, all vitest suites, and `npm run build:web` pass green.
