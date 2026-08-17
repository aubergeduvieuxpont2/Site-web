# Real-Database Integration Tests — Scope

**Date:** 2026-08-17
**Status:** Proposed — awaiting operator decision on §2
**Motivation:** three production defects in one week, all invisible to a green test suite

## Why

The API issues ~170 raw `sql\`` templates across 14 files. Every test that touches them drives a mocked tagged template, which records the call and returns canned rows **regardless of the SQL it was handed**. That pins call shape and ordering. It cannot observe whether Postgres would accept the statement at all.

Three defects shipped through a fully green suite in one week:

| Defect | What the suite asserted | What was true |
|---|---|---|
| `computeGuestStats` untyped null param | three passing tests covering `userId: null` | Postgres rejected the statement; every guest review 500'd |
| CSP blocked hydration | header string contained no `unsafe-inline` | every non-prerendered route was inert |
| Admin list ambiguous columns | (caught pre-merge only by a hand audit) | would have 500'd the reservations tab |

Two independent reviewers flagged the gap during the review-request work — *"nothing would catch an inverted `AT TIME ZONE` conversion"*, *"nothing would catch `INNER` substituted for `LEFT`"*. It has since cost three outages.

The common shape: **the assertion describes the artifact, not the behaviour.** Only executing the SQL closes it.

## 1. What makes this cheap here

Production code already supports injection — no restructuring required:

- The risky helpers take `sql` as a parameter: `computeGuestStats(sql, …)`, `enqueueReviewRequests(sql)`.
- Route handlers call `neon(c.env.DB_CONN)` internally, but **7 existing test files already `vi.mock("@neondatabase/serverless")`**. Pointing that mock at a real driver instead of a stub is a one-file change to the test harness.

So the work is a test harness plus test cases, not a refactor.

## 2. The one decision — where the test database comes from

**Option A — Postgres service container in CI (recommended).**

```yaml
services:
  postgres:
    image: postgres:16
    env: { POSTGRES_PASSWORD: postgres }
    options: >-
      --health-cmd pg_isready --health-interval 10s
      --health-timeout 5s --health-retries 5
```

Schema comes from running the existing 45 migrations against it — they are already idempotent and ordered, and `schema.sql` covers only 10 tables so migrations are the real source of truth. Adds roughly 20–30s to CI. Free, hermetic, no secrets, parallel-safe.

Caveat: the code imports `neon()`, whose HTTP driver cannot talk to a plain container, so the harness adapts `pg` into the same tagged-template signature. That adapter is the only new abstraction, ~20 lines.

Would this have caught all three defects? The two SQL ones, yes — untyped-parameter rejection and ambiguous columns are plain Postgres behaviour, identical on 16.x. The CSP one, no; that needs the browser check noted in §5.

**Option B — Neon branch per CI run.** Closest to production (same driver, same `AT TIME ZONE` data, real HTTP semantics). Costs a Neon API token in CI, branch lifecycle management, and cleanup on cancelled runs. Justified only if we find a defect that Option A provably cannot catch.

**Recommendation: A.** Start hermetic and free. Escalate to B only on evidence.

## 3. What to cover — tiered, stop where value drops

Not all 170 templates. Target queries where the SQL is non-obvious **and** a silent failure is expensive.

**Tier 1 — the bleeding (do first, ~1 day)**

| Target | Why |
|---|---|
| `computeGuestStats` both branches | the live 500; null-param typing |
| `enqueueReviewRequests` first pass | `AT TIME ZONE` correctness across both DST transitions, catch-up bounds |
| `enqueueReviewRequests` reminder pass | join + `reminder_sent_at`/`responded_at` predicates |
| per-guest suppression | correlated subquery on `lower(email)` |
| `GET /api/admin/reservations` | the `LEFT JOIN` + full `r.` aliasing |

DST is the highest-value case in the whole list: it is impossible to assert against a mock, and wrong-by-one-hour is invisible until a guest complains.

**Tier 2 — money and access (~1 day)**

`availability.ts` (overbooking), `holds.ts` (expiry releasing inventory), `assignments.ts`, `auth/session.ts`, `auth/rateLimit.ts`.

**Tier 3 — opportunistic.** Everything else, added when a query is next touched. Explicitly **not** a backfill project.

## 4. Shape of the work

1. `apps/api/test/db/harness.ts` — start-of-suite migration apply, per-test transaction rollback for isolation, `pg`→tagged-template adapter.
2. `apps/api/vitest.config.ts` — a second project or `*.db.test.ts` glob so unit tests stay fast and DB tests are opt-in locally via `npm run test:db`.
3. CI: add the service container and a `DATABASE_URL` env to the existing test step.
4. Tier 1 cases.

**Estimate: 2–3 days** including CI wiring. Tier 1 alone is ~1 day and captures most of the value.

## 5. Explicitly out of scope

- Replacing the existing mocked tests. They are fast and pin call ordering usefully. This is additive.
- Backfilling all 170 templates.
- Browser-level checks. The CSP defect needs a smoke test asserting a real page hydrates (`__sveltekit_*` present after direct navigation) — different tooling, worth its own small piece, and the third defect this month argues for it.

## 6. Success criterion

Reintroducing any of the three defects must turn CI red:

- revert the `::int` casts → red
- drop an `r.` prefix from the admin list query → red
- invert the `AT TIME ZONE` comparison → red

If a change cannot make CI red, this work has not paid for itself.
