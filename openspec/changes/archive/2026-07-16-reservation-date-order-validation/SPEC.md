# Reservation Date-Order Validation

## Task

The public reservation flow accepts date ranges where the departure date
(`checkOut`) is **on or before** the arrival date (`checkIn`), including equal
dates, because no order check runs on the submitted values. Add strict
departure-after-arrival validation on **both** the API and the reservation form,
surfacing one consistent French error, by reusing the existing
`reservationDatesValid(arrive, depart)` helper.

Constraints:

- Dates remain **optional**. Only reject when *both* `checkIn` and `checkOut`
  are present (non-null after `trimToNull`) and `checkOut <= checkIn`.
- Surgical change only — no migrations, no field renames, no handler-body
  rewrites, no unrelated refactors.

## Schema Changes

None. No database migration is created or required. This change is backward
compatible with all existing stored reservations.

## API Types

No new request/response types are introduced. The existing
`ReservationRequestSchema` gains a `superRefine` that enforces date ordering; its
shape is unchanged (`checkIn` / `checkOut` stay optional, nullable strings).

Failure response (unchanged shape, produced by the existing `reservationHook`):

```jsonc
// HTTP 400
{ "error": "La date de départ doit être postérieure à la date d'arrivée." }
```

Frontend pure helper signature (new):

```ts
// apps/web/src/lib/utils.ts
/** True when both dates are present and checkOut is NOT strictly after checkIn. */
export function datesOutOfOrder(
  checkIn: string | null | undefined,
  checkOut: string | null | undefined
): boolean
```

## Implementation Steps

### Step 1 — `apps/api/src/index.ts` (schema refine)

- Ensure `reservationDatesValid` is imported from `./assignments` (add to the
  existing import if absent).
- Append a `.superRefine((data, ctx) => { ... })` to `ReservationRequestSchema`
  (after the object definition at line 99–116). Inside:
  - Guard: if `data.checkIn == null || data.checkOut == null`, return (do
    nothing) — optional dates stay valid.
  - If both are present and `!reservationDatesValid(data.checkIn, data.checkOut)`,
    call `ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["checkOut"], message:
    "La date de départ doit être postérieure à la date d'arrivée." })`.
- Do **not** touch the handler body (lines ~296–345) or add any Neon access; the
  refine runs before the handler, so failures short-circuit via `reservationHook`
  into the existing 400 JSON with `error` set to the message above.

### Step 2 — `apps/web/src/lib/utils.ts` (pure helper)

- Add and export `datesOutOfOrder(checkIn, checkOut)`:
  - Trim both inputs; if either is empty/nullish, return `false` (valid).
  - Otherwise return `checkOut <= checkIn` using lexicographic string
    comparison, which is chronologically correct for zero-padded `YYYY-MM-DD`.
- Keep it dependency-free and side-effect-free.

### Step 3 — `apps/web/src/routes/contact/+page.svelte` (form wiring)

- Import `datesOutOfOrder` from `$lib/utils`.
- Add `checkOut?: string;` to the `fieldErrors` state type (line 29–34).
- In `validateClient()` (line 72–87), after the existing checks and before
  `fieldErrors = errors;`, add:
  `if (datesOutOfOrder(form.checkIn, form.checkOut)) errors.checkOut = "La date de
  départ doit être postérieure à la date d'arrivée.";`
- Bind the departure input's `min` to the chosen arrival: on the checkout
  `<input>` (line ~292–298) add `min={form.checkIn || undefined}`.
- Render an inline error block under the checkout input mirroring the existing
  field-error pattern (e.g. the `firstName` block at lines ~210–218): guarded by
  `{#if fieldErrors.checkOut}`, with `aria-describedby`/`id` wiring consistent
  with the other fields. Preserve the existing responsive `field-row` layout.

### Step 4 — `apps/api/test/reservations.test.ts` (API schema tests)

- Add `ReservationRequestSchema.safeParse` cases (valid base payload with
  required `firstName`, `lastName`, valid `email`, `roomCount >= 1`):
  - `checkIn` == `checkOut` → `success === false`, and the failing issue message
    equals the French sentence with `path` `["checkOut"]`.
  - `checkOut` < `checkIn` → `success === false` with the same message/path.
  - `checkOut` > `checkIn` → `success === true`.
  - both dates empty/omitted → `success === true`.
  - one date present, the other empty/omitted → `success === true`.

### Step 5 — `apps/web/src/lib/__tests__/utils.test.ts` (helper unit test)

- Add cases for `datesOutOfOrder`:
  - both empty / one empty (either side) → `false` (valid).
  - equal dates → `true` (invalid).
  - reversed (checkOut < checkIn) → `true` (invalid).
  - ordered (checkOut > checkIn) → `false` (valid).

## Acceptance Criteria

- `ReservationRequestSchema.safeParse` returns `success: false` for a payload
  with `checkIn: "2026-08-10"`, `checkOut: "2026-08-10"` (equal) and the first
  issue message is `"La date de départ doit être postérieure à la date
  d'arrivée."` on path `["checkOut"]`.
- The same schema returns `success: false` for `checkIn: "2026-08-10"`,
  `checkOut: "2026-08-09"` (reversed) with the same message.
- The same schema returns `success: true` for `checkIn: "2026-08-10"`,
  `checkOut: "2026-08-11"` (ordered).
- The same schema returns `success: true` when both dates are empty/omitted, and
  when exactly one date is present.
- `datesOutOfOrder("", "")`, `datesOutOfOrder("2026-08-10", "")`, and
  `datesOutOfOrder("", "2026-08-10")` each return `false`.
- `datesOutOfOrder("2026-08-10", "2026-08-10")` and
  `datesOutOfOrder("2026-08-10", "2026-08-09")` each return `true`;
  `datesOutOfOrder("2026-08-10", "2026-08-11")` returns `false`.
- The contact page imports `datesOutOfOrder` from `$lib/utils` and calls it inside
  `validateClient`, setting `fieldErrors.checkOut` to the French sentence.
- The checkout `<input>` on the contact page has a `min` attribute bound to
  `form.checkIn`.
- `npm run typecheck`, all API + web vitest suites (including the new cases), and
  `npm run build:web` pass with no existing test regressions.
