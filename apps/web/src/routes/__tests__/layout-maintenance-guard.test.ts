// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from 'svelte/server';
import type { Snippet } from 'svelte';

// The root layout wires SvelteKit browser-only modules: `afterNavigate` from
// `$app/navigation` (imported directly) and the `page` store from `$app/stores`
// (imported transitively by Nav). Neither exists under a plain SSR render, so
// both are stubbed. onMount/$effect do not run in SSR, so loadSettings/loadAuth
// never fire — the render reflects the current `settings` store state directly.
vi.mock('$app/navigation', () => ({
  afterNavigate: vi.fn(),
}));

vi.mock('$app/stores', () => ({
  page: {
    subscribe(run: (value: unknown) => void) {
      run({
        url: new URL('http://localhost/'),
        params: {},
        route: { id: '/' },
        status: 200,
        error: null,
        data: {},
        form: null,
      });
      return () => {};
    },
  },
}));

import Layout from '../+layout.svelte';
import { settings } from '$lib/settings.svelte';

// A no-op snippet: the guard under test lives above `{@render children()}`, so
// the page content is irrelevant to these assertions.
const noopChildren = (() => {}) as unknown as Snippet;

function renderLayout(): string {
  return render(Layout, { props: { children: noopChildren } }).body;
}

describe('+layout.svelte (layout-maintenance-guard SSR)', () => {
  afterEach(() => {
    settings.reservationsEnabled = true;
  });

  it('does not render the maintenance banner when reservations are enabled', () => {
    settings.reservationsEnabled = true;
    expect(renderLayout()).not.toContain('data-testid="maintenance-banner"');
  });

  it('renders the maintenance banner when reservations are disabled', () => {
    settings.reservationsEnabled = false;
    const html = renderLayout();
    expect(html).toContain('data-testid="maintenance-banner"');
    expect(html).toContain('Réservations en pause — maintenance en cours.');
  });

  it('exposes the banner as a polite status live region when active', () => {
    settings.reservationsEnabled = false;
    const html = renderLayout();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('inserts the banner after the Nav and before the main content', () => {
    settings.reservationsEnabled = false;
    const html = renderLayout();
    const bannerIdx = html.indexOf('data-testid="maintenance-banner"');
    const mainIdx = html.indexOf('data-testid="main-content"');
    expect(bannerIdx).toBeGreaterThan(-1);
    expect(mainIdx).toBeGreaterThan(-1);
    // Banner sits above the <main> slot per the layout-maintenance-guard design.
    expect(bannerIdx).toBeLessThan(mainIdx);
  });

  it('toggles the banner reactively as reservationsEnabled flips', () => {
    settings.reservationsEnabled = true;
    expect(renderLayout()).not.toContain('data-testid="maintenance-banner"');
    settings.reservationsEnabled = false;
    expect(renderLayout()).toContain('data-testid="maintenance-banner"');
    settings.reservationsEnabled = true;
    expect(renderLayout()).not.toContain('data-testid="maintenance-banner"');
  });

  describe('source-level checks', () => {
    it('imports MaintenanceBanner and the settings store', async () => {
      const raw = await import('../+layout.svelte?raw');
      const text = (raw as { default: string }).default;
      expect(text).toContain(
        "import MaintenanceBanner from \"$lib/components/MaintenanceBanner.svelte\"",
      );
      expect(text).toContain('settings } from "$lib/settings.svelte"');
    });

    it('guards the banner on !settings.reservationsEnabled', async () => {
      const raw = await import('../+layout.svelte?raw');
      const text = (raw as { default: string }).default;
      expect(text).toContain('{#if !settings.reservationsEnabled}');
      expect(text).toContain('<MaintenanceBanner />');
    });

    it('injects no raw HTML (XSS safe)', async () => {
      const raw = await import('../+layout.svelte?raw');
      const text = (raw as { default: string }).default;
      expect(text).not.toContain('{@html');
      expect(text).not.toContain('innerHTML');
    });
  });
});
