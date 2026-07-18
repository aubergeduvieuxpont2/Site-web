import type { Handle } from '@sveltejs/kit';

/**
 * Conservative Content-Security-Policy for the SPA.
 *
 * - `script-src 'self'` — no inline/eval scripts; SvelteKit ships external bundles.
 * - `style-src 'self' 'unsafe-inline'` — Svelte/Vite may inline styles, and Tailwind
 *   utility styles are emitted as stylesheets; 'unsafe-inline' keeps runtime styles working.
 * - `img-src 'self' data: https:` — same-origin images, inline data URIs, and the
 *   picsum/R2 image sources served over https.
 * - `connect-src 'self' https:` — API calls to same-origin `/api/*` and any https endpoint.
 * - `frame-ancestors 'none'` + `X-Frame-Options: DENY` — clickjacking protection.
 * - inline JSON-LD from Seo.svelte is a <script type="application/ld+json"> data block,
 *   which is NOT executable and is therefore unaffected by `script-src`.
 */
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "connect-src 'self' https:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': CSP,
};

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
};
