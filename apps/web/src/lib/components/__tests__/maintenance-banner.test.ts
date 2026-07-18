// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import MaintenanceBanner from '../MaintenanceBanner.svelte';

function renderBanner(props: { text?: string } = {}) {
  return render(MaintenanceBanner, { props }).body;
}

describe('MaintenanceBanner.svelte', () => {
  it('renders the root div with data-testid="maintenance-banner"', () => {
    expect(renderBanner()).toContain('data-testid="maintenance-banner"');
  });

  it('exposes the banner as a polite status live region', () => {
    const html = renderBanner();
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('renders the fixed FR maintenance string by default', () => {
    expect(renderBanner()).toContain(
      'Réservations en pause — maintenance en cours.',
    );
  });

  it('renders a caller-supplied text prop instead of the default', () => {
    const html = renderBanner({ text: 'Fermé pour la saison.' });
    expect(html).toContain('Fermé pour la saison.');
    expect(html).not.toContain('Réservations en pause');
  });

  it('renders text as content only — never as raw HTML', () => {
    const html = renderBanner({ text: '<img src=x onerror=alert(1)>' });
    // Svelte escapes interpolated text, so the angle brackets are entity-encoded.
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });
});
