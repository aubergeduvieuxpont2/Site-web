# Security P0 — Trust Boundaries

Harden inter-service authentication across three attack surfaces:

1. **HubSpot gateway** (`apps/hubspot`) — require a shared-secret header on all
   inbound `/ops/*` requests; expose `/health` without leaking token or DB error
   text; disable public workers.dev and preview URLs.
2. **Email-ingest Worker** (`apps/email-ingest`) — verify DKIM/SPF domain alignment
   before creating a reservation; remove the spoofable `DEV_SENDER` bypass from
   production; attach `X-Internal-Auth` on every internal POST to the API.
3. **API Worker** (`apps/api`) — require `X-Internal-Auth` on
   `/internal/ota-bookings`; attach `X-Internal-Auth` on all outbound
   `HUBSPOT.fetch` calls.
4. **CI workflows** — scope Cloudflare credentials to the deploy step only.

No schema migrations are required for this batch.

## Acceptance Criteria

1. **T-GW-001a** — `POST /ops/enqueue` and `POST /ops/execute` on the HubSpot
   gateway return **401 Unauthorized** when the `X-Internal-Auth` header is
   absent or contains the wrong value.

2. **T-GW-001b** — `POST /ops/enqueue` and `POST /ops/execute` return a non-401
   (202 / 200) response when `X-Internal-Auth` equals `GATEWAY_AUTH_SECRET`.

3. **T-GW-002a** — `GET /health` returns `200 { status: "ok" }` when the token
   and DB checks pass, and `503 { status: "degraded" }` on failure; the body
   **never** contains a token value or raw DB error message.

4. **T-GW-003a** — `apps/hubspot/wrangler.jsonc` has both `workers_dev: false`
   and `preview_urls: false`.

5. **T-EI-001a** — `verifyAuth` returns `true` only for a domain-aligned
   DKIM-pass (preferred) or SPF-pass result whose domain matches an allowed
   provider domain (e.g. `airbnb.com`, `expedia.com`); returns `false` for an
   unrelated domain, a non-pass result, or a `null` / absent
   `Authentication-Results` header.

6. **T-EI-001b** — An inbound OTA email with a valid, aligned
   `Authentication-Results` header causes the handler to POST a parsed booking
   to the API internal endpoint.

7. **T-EI-001c** — An inbound OTA email with a missing or failing
   `Authentication-Results` header is **forwarded** normally but triggers **no**
   reservation POST to the API internal endpoint.

8. **T-EI-002a** — `apps/email-ingest/wrangler.jsonc` top-level `vars` contain
   **no** `DEV_SENDER` key; no code path trusts a bare `From` header as an
   authentication signal in production.

9. **T-EI-003a** — Both internal POSTs issued by the email-ingest handler carry
   an `X-Internal-Auth` header whose value equals `INTERNAL_OTA_SECRET`.

10. **T-API-001a** — `POST /internal/ota-bookings` returns **401
    `{ error: "Unauthorized" }`** when `X-Internal-Auth` is absent or
    mismatched; the check runs before the request body is read.

11. **T-API-001b** — `POST /internal/ota-bookings` returns a **2xx** response
    when `X-Internal-Auth` equals `INTERNAL_OTA_SECRET`.

12. **T-API-002a** — `enqueueHubspotOps` (or the equivalent call site) attaches
    `X-Internal-Auth` on the outgoing `/ops/enqueue` request to the HubSpot
    gateway.

13. **T-CI-001a** — The deploy workflow YAML files contain **no** job-level
    `CLOUDFLARE_API_TOKEN` environment variable; the token appears only as a
    step-level `env` entry on the `wrangler deploy` step.

### Invariants (must hold throughout)

- All secret comparisons use a length-guarded constant-time compare (XOR,
  no early return); an unset or empty secret always yields 401, never open
  access.
- No new secret value appears in `apps/web` or the client bundle.
- Verification failure in email-ingest suppresses the reservation POST but
  **never** suppresses mail forwarding in production.
- `npm run typecheck` completes with 0 errors across all workspaces; existing
  test suites remain green.
