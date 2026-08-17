// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { handle } from './hooks.server';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — svelte.config.js is plain JS with no declaration file. The
// shape we rely on is asserted structurally in the kit.csp suite below, so a
// config change that breaks it fails a test rather than slipping through.
import config from '../svelte.config.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

async function run(initial?: Response) {
  const resolve = async () => initial ?? new Response('ok', { status: 200 });
  return handle({ event: {} as any, resolve } as any);
}

describe('hooks.server handle', () => {
  it('sets the core security headers on every response', async () => {
    const res = await run();
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('X-Frame-Options')).toBe('DENY');
    expect(res.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload',
    );
    expect(res.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  // Regression guard for the outage where a hand-written `script-src 'self'`
  // blocked SvelteKit's inline hydration bootstrap, leaving every
  // non-prerendered route inert on direct navigation or hard reload. CSP now
  // comes from `kit.csp` in svelte.config.js, which appends build-time hashes
  // for that bootstrap. Two CSP headers are enforced as their INTERSECTION, so
  // a second one set here would block the hashed script again — and the header
  // would still read correctly while the app stayed broken, which is exactly
  // how the original bug survived a passing header-string test.
  it('does not set a CSP header (kit.csp owns it, so hashes are not intersected away)', async () => {
    const res = await run();
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('preserves the resolved response body/status', async () => {
    const res = await run(new Response('payload', { status: 201 }));
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('payload');
  });
});

describe('kit.csp directives (svelte.config.js)', () => {
  const csp = (config as any).kit.csp;
  const directives = csp.directives as Record<string, string[]>;

  // 'hash' is required rather than incidental: nonces need a per-request value,
  // which prerendered pages cannot have, so hashing is the only mode covering
  // both prerendered and SSR routes.
  it('uses hash mode so SvelteKit whitelists its own inline bootstrap', () => {
    expect(csp.mode).toBe('hash');
  });

  it('keeps script-src free of unsafe directives', () => {
    expect(directives['script-src']).toContain('self');
    expect(directives['script-src']).toContain('https://js.stripe.com');
    expect(directives['script-src']).not.toContain('unsafe-inline');
    expect(directives['script-src']).not.toContain('unsafe-eval');
  });

  it('denies framing and object embedding', () => {
    expect(directives['frame-ancestors']).toEqual(['none']);
    expect(directives['default-src']).toEqual(['self']);
    expect(directives['object-src']).toEqual(['none']);
  });

  it("keeps style-src 'unsafe-inline' so Svelte runtime styles work", () => {
    expect(directives['style-src']).toContain('self');
    expect(directives['style-src']).toContain('unsafe-inline');
  });

  it('scopes frame-src to Stripe domains for embedded checkout', () => {
    expect(directives['frame-src']).toContain('https://js.stripe.com');
    expect(directives['frame-src']).toContain('https://*.stripe.com');
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
