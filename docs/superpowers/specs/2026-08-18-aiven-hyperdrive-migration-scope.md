# Neon → Aiven via Cloudflare Hyperdrive — Migration Scope

**Date:** 2026-08-18
**Status:** Proposed — two blocking questions in §2 before any work starts
**Trigger:** Neon compute quota exhausted in ~15 days, taking the entire API down (HTTP 402 on every query)

## 1. Why move at all

Neon bills **compute-time**. Its serverless compute autosuspends when idle, so cost tracks how often anything touches the database — not how much data is stored.

That interacts badly with this application. The cron woke the database every 60 seconds, so compute never suspended and billed ~744 hours/month against a free allowance in the ~190 range. #77 cut that to every 5 minutes (5× reduction), but the operator's read is that **even that will not fit the free plan** — the honest conclusion is that fitting Neon's free tier means removing scheduled work entirely, which the product needs.

Aiven bills **instance + storage**, not compute-time. A 5-minute cron costs the same as no cron. That structurally removes the failure mode rather than deferring it.

## 2. Two blocking questions

**(a) Does Hyperdrive require a Workers Paid plan?** I have not verified this and it is decision-relevant: if Hyperdrive needs the $5/month Workers Paid plan, the migration is not "free tier to free tier". It may still be the right call — $5/month is likely below a Neon upgrade, and it buys a structurally better fit — but it should be a conscious trade, not a surprise. **Check before starting.**

**(b) Does Aiven's free PostgreSQL plan still exist, and what are its limits?** Specifically the connection cap (historically ~20 on the smallest plans) and whether free plans expire. Connection limits matter more than usual here — see §4.

## 3. The technical constraint, and why it is smaller than it looks

Cloudflare Workers cannot open ordinary TCP connections to Postgres the way a Node server can. Neon works today because `@neondatabase/serverless` speaks **HTTP**. Aiven is standard Postgres over TCP, so it needs **Hyperdrive**, which fronts a TCP database and pools connections on Cloudflare's edge.

Three findings make the code change far cheaper than the 70 call sites suggest:

| Finding | Why it matters |
|---|---|
| **`nodejs_compat` is already enabled** (`apps/api/wrangler.jsonc:8`) | Hyperdrive's drivers require it. No compatibility-flag change, no `compatibility_date` bump. |
| **Every query is a pure tagged template.** Zero uses of `sql.query()`, `sql([...])`, or other driver-specific helpers | `postgres.js` exposes a tagged template with the same call shape and also returns rows directly. The 170 query sites need **no rewriting**. |
| **All access funnels through `neon(conn)`** — 70 call sites, but only **16 files** across two Workers (`api`: 12, `hubspot`: 4) | The change is one adapter module plus 16 import swaps. |

Additionally, #76 already built and tested a `pg`-backed tagged-template adapter satisfying the same signature (`apps/api/test/db/harness.ts`), proving the seam works.

**Approach:** add `apps/api/src/db.ts` exporting a `getSql(env)` that returns a `neon()`-shaped tagged template backed by `postgres.js` over the Hyperdrive binding. Replace `neon(c.env.DB_CONN)` with `getSql(c.env)` in 16 files. Production code otherwise untouched.

## 4. Risks that need deciding, not just noting

**Hyperdrive query caching is the dangerous one.** Hyperdrive can cache read queries. For a booking system that is a correctness hazard, not an optimisation: a cached availability read can sell the same room twice. **Caching must be disabled**, or enabled only for provably-static reads. Default-on caching would be the single most damaging thing to get wrong here.

**Connection limits.** Hyperdrive pools, which is precisely why it is the right choice — but Aiven free plans cap connections tightly. Pool sizing needs to respect that cap, and the cron plus request traffic share it.

**Local development.** `.dev.env`'s `DB_CONN` drives local dev and the migration runner. Hyperdrive has a local binding story (`wrangler dev` can connect directly to the database), but the migration runner (`scripts/migrate.mjs`) talks to Postgres directly and must keep working against a plain connection string. Both paths need to work, and CI's #76 test container must be unaffected.

**Two Workers, not one.** `apps/hubspot` also queries the database (4 files). It needs its own Hyperdrive binding and the same adapter, or it breaks silently after the API migrates.

## 5. Data strategy — the operator's chosen path, and its one sharp edge

Agreed plan: **stand up an empty Aiven database now to restore service, then manually transfer data next month.**

This is reasonable under an active outage — Neon is currently unreachable (402), so `pg_dump` is not even possible right now.

**The sharp edge: primary-key collisions.** A fresh database restarts every identity sequence at 1. New reservations, users and reviews created on Aiven will occupy IDs 1..N — exactly the IDs the Neon rows already hold. Merging later becomes a conflict-resolution exercise across every table with a foreign key.

**Mitigation, cheap and decisive:** after applying migrations to Aiven, advance every identity sequence past the Neon maximum:

```sql
ALTER SEQUENCE reservations_id_seq RESTART WITH 100000;
-- and likewise for users, reviews, email_outbox, …
```

Then the later transfer is a plain insert with no renumbering and no broken references. **This must happen before the first production write to Aiven**, or the opportunity is gone.

**Also understand what "empty" means on day one:** every user account, session, reservation, review and settings row is absent. Guests and admins cannot log in until accounts are recreated or transferred, and the four `settings` rows must be re-set through the admin UI. Migrations seed defaults, so the site will function — but as a fresh install.

## 6. Phases

1. **Verify §2** — Hyperdrive plan requirement, Aiven free-plan limits. Stop here if either answer changes the decision.
2. **Provision** — Aiven Postgres, Hyperdrive config pointing at it, caching **disabled**, secrets set.
3. **Adapter** — `db.ts` + 16 import swaps in `api` and `hubspot`. Unit suite should pass untouched; #76's DB tests prove the tagged-template shape.
4. **Schema** — run the 45 migrations against Aiven, then bump sequences (§5).
5. **Cutover** — deploy, verify `/api/settings`, `/api/rooms`, auth, and a booking end to end.
6. **Reconcile** (next month, once Neon is readable) — `pg_dump` the old data and insert it beneath the sequence offset.

**Estimate: 1–2 days of work**, dominated by provisioning and cutover verification rather than code. The code change is genuinely small.

## 7. Recommendation

Proceed, subject to §2. The reasoning is sound: this is a structural mismatch between a cron-driven application and compute-time billing, not a tuning problem — and #77 reduces the burn without removing the mismatch.

Two things I would not compromise on: **Hyperdrive caching off**, and **sequence offsets before the first write**. Both are cheap now and expensive to retrofit.
