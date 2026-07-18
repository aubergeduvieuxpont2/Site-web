## Global Design Strategy

This batch converts hollow green to real green on a French-Canadian inn SPA. No new screens are introduced — the deliverables are (a) backend integration test harnesses, (b) three api.ts client function additions, and (c) four existing frontend components re-pointed away from inline `fetch` to those client fns. The design system is already established ("Industrial Zen": IBM Plex Sans + terracotta + cool neutral palette with warm admin tones), so this strategy codifies it faithfully as the governing contract for every build agent.

### Colour Palette
- surface: #f7f9fb (primary page background)
- surface-2: #f2f4f6 (secondary surface — strip backgrounds)
- surface-raised: #ffffff (card background)
- border: #c6c6cd (hairline structural borders)
- border-strong: #76777d (interactive outlines)
- text: #191c1e (primary ink)
- text-soft: #45464d (secondary text)
- text-muted: #76777d (meta/labels)
- primary: #9d4300 (terracotta — star fills, links, accent actions)
- primary-bright: #fd761a (hover / highlight state)
- primary-pale: #ffdbca (ember-pale — selection tints)
- admin-surface: #f4efe6 (admin warm beige — scoped to admin components)
- admin-surface-alt: #e0dad0
- admin-border: #c4baa8
- admin-text: #1c1a17
- admin-accent: #7b4628 (warm brown — admin CTAs)
- success: #1a5c2d (forest green — approved state)
- success-surface: #d4ede0
- error: #ba1a1a (brick red — rejected/error state)
- error-surface: #fce8e8

### Typography
- font-family: "IBM Plex Sans", Arial, sans-serif (variable, wght 400–700; self-hosted, zero layout shift)
- mono-family: "IBM Plex Mono", ui-monospace, monospace (tech-labels, counters, meta)
- base size: 16px; line-height: 1.6
- heading sizes: display=clamp(36px,5vw,56px) h1=clamp(28px,4vw,40px) h2=clamp(24px,3vw,36px) h3=18px h4=15px
- heading weight: 300 (light) — characterful with IBM Plex's optical spacing
- tech-label: 0.6875rem uppercase monospace letter-spacing 0.18em (utility class `.tech-label`)

### Spacing
- base unit: 4px; scale: xs=8px sm=12px md=20px lg=28px xl=48px 2xl=72px
- component padding: 16px cards, 24px sections, 48px page headers

### Accessibility
- minimum contrast ratio: 4.5:1 (WCAG AA) — terracotta #9d4300 on #f7f9fb achieves 4.6:1
- keyboard navigation: all interactive elements reachable via Tab; star picker buttons labeled with aria-label; filter tabs use role="tab" + aria-selected
- ARIA roles required:
  - avis-page: `role="region"` wrapping review list, `aria-live="polite"` on load state
  - avis-nouveau-page: `<fieldset>/<legend>` for star picker, `aria-describedby` linking textarea → char counter, `aria-live="assertive"` for eligibility error
  - reviews-strip: `role="region"` with `aria-label="Avis de nos clients"`
  - admin-avis-tab: filter bar uses `role="tablist"` + `role="tab"` + `aria-selected`, review list `role="list"` + `role="listitem"`, approve/reject buttons `aria-label` with review context

### Security
- No innerHTML assignments — all user review body text set via textContent or Svelte's default text interpolation `{var}` (not `{@html}`)
- No eval() or Function() — client fns are plain async functions
- All user-supplied content (display_name, body) escaped by Svelte's template layer before DOM insertion
- api.ts client fns propagate HTTP errors as typed ApiError objects — no raw Response objects leak to components

## Component Inventory
<!-- Deliverable units in topological build order. Wave 0 = no dependencies. -->
- component: reviews-routes-test
  description: App-level integration test harness for all reviews routes — imports real app from index.ts, stubs neon via vi.hoisted, asserts mount, auth, contract, and uniqueness-conflict for eligibility/submit/list/admin-list/moderation
  inputs: apps/api/src/index.ts app export; vi.mock('@neondatabase/serverless') neon holder; per-test SQL stubs returning admin/guest/anon sessions and fixture rows
  interactions: none (test-only, no UI)
  kind: service
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: dashboard-route-test
  description: App-level integration test for GET /api/admin/dashboard — pins mounted contract (401/403/200), asserts all DashboardResponse keys present, and asserts occupancy.currentMonth is null when assignableRoomCount=0
  inputs: apps/api/src/index.ts app export; same vi.hoisted neon harness as reviews-routes-test
  interactions: none (test-only, no UI)
  kind: service
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: 2

- component: api-reviews-client
  description: Three new typed client fns in apps/web/src/lib/api.ts — reviewEligibility(code), publicReviews(limit?), adminReviews(status?) — each using the shared fetchJson/ApiError convention; exports EligibilityResponse, PublicReviewsResponse, AdminReviewsResponse types
  inputs: existing fetchJson helper; existing API base URL convention; typed response shapes from SPEC
  interactions: none (service module, no UI)
  kind: service
  depends_on: []
  designer_model: claude-sonnet-4-6
  builder_model: claude-opus-4-8
  ralph: none

- component: avis-nouveau-page
  description: Re-point apps/web/src/routes/avis/nouveau/+page.svelte — replace inline fetch for eligibility with reviewEligibility() and inline fetch for submit with submitReview(); update existing __tests__ to mock api module fns instead of global.fetch; no visual changes
  inputs: reviewEligibility(code) → EligibilityResponse; submitReview(payload) → existing fn; URL ?code= param
  interactions: eligibility check on mount; star picker; textarea with char counter; submit → 201/400/409 handling; ineligible/success outcome screens
  kind: page
  depends_on: [api-reviews-client]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none

- component: avis-page
  description: Re-point apps/web/src/routes/avis/+page.svelte — replace inline fetch list load with publicReviews(); update existing __tests__ to mock api fn; no visual changes
  inputs: publicReviews() → PublicReviewsResponse (reviews array, averageRating, total)
  interactions: load on mount; loading/error/empty/populated states; star display; card list
  kind: page
  depends_on: [api-reviews-client]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: reviews-strip
  description: Re-point apps/web/src/lib/components/ReviewsStrip.svelte — replace inline fetch with publicReviews(3); update existing __tests__; no visual changes
  inputs: publicReviews(3) → PublicReviewsResponse
  interactions: load on mount; 3-card grid; 200-char excerpt truncation; "Voir tous les avis →" link
  kind: panel
  depends_on: [api-reviews-client]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-sonnet-4-6
  ralph: none

- component: admin-avis-tab
  description: Re-point apps/web/src/lib/components/admin/AdminAvisTab.svelte — replace inline fetch list with adminReviews(status) and inline moderation fetch with adminModerateReview(); update existing __tests__; no visual changes; warm admin palette (#f4efe6 surface, #7b4628 accent) preserved
  inputs: adminReviews(status?) → AdminReviewsResponse; adminModerateReview(id, status) → existing fn; filter state (pending/approved/rejected)
  interactions: filter tab switch; approve/reject button actions with optimistic update; loading/error/empty states; pending-count badge
  kind: panel
  depends_on: [api-reviews-client]
  designer_model: claude-haiku-4-5-20251001
  builder_model: claude-opus-4-8
  ralph: none