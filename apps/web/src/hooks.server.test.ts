// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { handle } from './hooks.server';

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

  it('sets a CSP that denies framing', async () => {
    const res = await run();
    const csp = res.headers.get('Content-Security-Policy');
    expect(csp).toBeTruthy();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    // style-src keeps 'unsafe-inline' so the SPA's inline styles keep working.
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it('preserves the resolved response body/status', async () => {
    const res = await run(new Response('payload', { status: 201 }));
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('payload');
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
