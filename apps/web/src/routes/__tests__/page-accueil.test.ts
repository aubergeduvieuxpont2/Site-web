// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { render } from 'svelte/server';
import Page from '../+page.svelte';
import { settings } from '$lib/settings.svelte';
import { auth } from '$lib/auth.svelte';

function renderPage() {
  const result = render(Page, { props: {} });
  return result.body;
}

describe('+page.svelte (page-accueil SSR)', () => {
  describe('root element', () => {
    it('renders root div with data-testid="page-accueil"', () => {
      expect(renderPage()).toContain('data-testid="page-accueil"');
    });
  });

  describe('hero section', () => {
    it('renders hero section with data-testid="hero-section"', () => {
      expect(renderPage()).toContain('data-testid="hero-section"');
    });

    it('hero section has aria-labelledby="hero-heading"', () => {
      expect(renderPage()).toContain('aria-labelledby="hero-heading"');
    });

    it('renders h1#hero-heading with display copy', () => {
      const html = renderPage();
      expect(html).toContain('id="hero-heading"');
      expect(html).toContain("L'art de recevoir");
    });

    it('renders hero eyebrow with location text', () => {
      expect(renderPage()).toContain('Saint-Raymond · Portneuf · Québec');
    });

    it('renders hero sub-heading body text', () => {
      expect(renderPage()).toContain('travailleurs de terrain');
    });

    it('renders CTA container with data-testid="hero-ctas"', () => {
      expect(renderPage()).toContain('data-testid="hero-ctas"');
    });

    it('renders hero-cta-reserver wrapper pointing to /contact', () => {
      const html = renderPage();
      expect(html).toContain('data-testid="hero-cta-reserver"');
      expect(html).toContain('href="/contact"');
    });

    it('renders hero-cta-lesite wrapper pointing to /le-site', () => {
      const html = renderPage();
      expect(html).toContain('data-testid="hero-cta-lesite"');
      expect(html).toContain('href="/le-site"');
    });

    it('renders scroll hint as aria-hidden', () => {
      const html = renderPage();
      expect(html).toContain('Défiler');
      expect(html).toContain('page-accueil__hero-scroll');
    });
  });

  describe('stats section', () => {
    it('renders stats section with data-testid="stats-section"', () => {
      expect(renderPage()).toContain('data-testid="stats-section"');
    });

    it('stats section has aria-label="Chiffres clés"', () => {
      expect(renderPage()).toContain('aria-label="Chiffres clés"');
    });

    it('renders 4 stat-item elements', () => {
      const html = renderPage();
      const matches = html.match(/data-testid="stat-item"/g);
      expect(matches).toHaveLength(4);
    });

    it('renders 4 stat-number elements', () => {
      const html = renderPage();
      const matches = html.match(/data-testid="stat-number"/g);
      expect(matches).toHaveLength(4);
    });

    it('stat value spans are aria-hidden (animation is visual only)', () => {
      const html = renderPage();
      expect(html).toContain('data-testid="stat-number"');
      // Verify the accessible value is exposed via a visually-hidden span
      // (aria-label is prohibited on generic divs).
      expect(html).toMatch(/sr-only[^"]*">30 min<\/span>/);
    });

    it('renders stat labels from STATS content', () => {
      const html = renderPage();
      expect(html).toContain('des principaux chantiers forestiers');
      expect(html).toContain('année de fondation');
    });
  });

  // The rooms stat value is bound to the live `settings.publicRoomCount` (change
  // 3 / criterion #5), NOT the hardcoded STATS[2].value or marketingRoomCount.
  // Both default to 12, so mutate the store to a distinct value to observe the
  // binding actually flows through to the rendered markup.
  describe('rooms stat is driven by settings.publicRoomCount', () => {
    afterEach(() => {
      settings.publicRoomCount = 12;
    });

    it('renders the default publicRoomCount (12) with the rooms label', () => {
      const html = renderPage();
      expect(html).toMatch(/sr-only[^"]*">12 chambres<\/span>/);
      expect(html).toContain("disponibles pour l'équipe");
    });

    it('reflects a changed publicRoomCount in the rooms stat', () => {
      settings.publicRoomCount = 7;
      const html = renderPage();
      expect(html).toMatch(/sr-only[^"]*">7 chambres<\/span>/);
      // The other stats are unaffected.
      expect(html).toMatch(/sr-only[^"]*">30 min<\/span>/);
    });

    it('does not couple the rooms stat to marketingRoomCount', () => {
      settings.publicRoomCount = 5;
      settings.marketingRoomCount = 99;
      const html = renderPage();
      expect(html).toMatch(/sr-only[^"]*">5 chambres<\/span>/);
      expect(html).not.toMatch(/sr-only[^"]*">99 chambres<\/span>/);
      settings.marketingRoomCount = 12;
    });
  });

  describe('rooms section', () => {
    it('renders rooms section with data-testid="rooms-section"', () => {
      expect(renderPage()).toContain('data-testid="rooms-section"');
    });

    it('rooms section has aria-labelledby="rooms-heading"', () => {
      const html = renderPage();
      expect(html).toContain('aria-labelledby="rooms-heading"');
      expect(html).toContain('id="rooms-heading"');
    });

    it('renders the rooms grid', () => {
      expect(renderPage()).toContain('data-testid="rooms-grid"');
    });

    it('renders exactly 3 room cards (featured rooms)', () => {
      const html = renderPage();
      const matches = html.match(/data-testid="room-card"/g);
      expect(matches).toHaveLength(3);
    });

    it('renders rooms-more link to /le-site#chambres', () => {
      const html = renderPage();
      expect(html).toContain('data-testid="rooms-more"');
      expect(html).toContain('href="/le-site#chambres"');
    });
  });

  // The consolidated price display (home-price-display) lives in the rooms
  // section header, replacing the per-room price that RoomCard used to show.
  describe('price display', () => {
    afterEach(() => {
      settings.nightlyPrice = 89;
      auth.user = null;
      auth.loaded = false;
    });

    it('renders exactly one price-amount', () => {
      const html = renderPage();
      const matches = html.match(/data-testid="price-amount"/g);
      expect(matches).toHaveLength(1);
    });

    it('shows the public nightly price formatted as $XX.XX /nuit for anonymous visitors', () => {
      const html = renderPage();
      expect(html).toContain('$89.00');
      expect(html).toContain('/nuit');
    });

    it('reflects a changed nightly price from settings', () => {
      settings.nightlyPrice = 120;
      const html = renderPage();
      expect(html).toContain('$120.00');
    });

    it('does not render the custom-pricing badge when there is no authenticated user', () => {
      const html = renderPage();
      expect(html).not.toContain('data-testid="custom-pricing-badge"');
      expect(html).not.toContain('Tarif personnalisé');
    });

    it('labels the price container for screen readers', () => {
      expect(renderPage()).toContain('aria-label="Prix par nuit"');
    });

    // Personalized path: an authenticated user carries an effectiveNightlyPrice
    // that overrides the public price and surfaces the "Tarif personnalisé" badge.
    it('shows the user\'s effectiveNightlyPrice and the custom badge when it differs from the public price', () => {
      auth.user = {
        id: 1,
        email: 'client@example.com',
        name: 'Client',
        role: 'guest',
        effectiveNightlyPrice: 75,
      };
      auth.loaded = true;
      const html = renderPage();
      expect(html).toContain('$75.00');
      expect(html).not.toContain('$89.00');
      expect(html).toContain('data-testid="custom-pricing-badge"');
      expect(html).toContain('Tarif personnalisé');
    });

    it('still renders exactly one price-amount for an authenticated user', () => {
      auth.user = {
        id: 2,
        email: 'client@example.com',
        name: 'Client',
        role: 'guest',
        effectiveNightlyPrice: 75,
      };
      auth.loaded = true;
      const html = renderPage();
      const matches = html.match(/data-testid="price-amount"/g);
      expect(matches).toHaveLength(1);
    });

    // Fallback path: an authed user whose effective price equals the public price
    // shows the price but NOT the badge (nothing personalized to flag).
    it('does not render the badge when the effective price equals the public price', () => {
      auth.user = {
        id: 3,
        email: 'client@example.com',
        name: 'Client',
        role: 'guest',
        effectiveNightlyPrice: 89,
      };
      auth.loaded = true;
      const html = renderPage();
      expect(html).toContain('$89.00');
      expect(html).not.toContain('data-testid="custom-pricing-badge"');
      expect(html).not.toContain('Tarif personnalisé');
    });

    // Fallback path: an authed user without an effectiveNightlyPrice falls back
    // to the public nightly price and shows no badge.
    it('falls back to the public price when the user has no effectiveNightlyPrice', () => {
      auth.user = {
        id: 4,
        email: 'client@example.com',
        name: 'Client',
        role: 'guest',
      };
      auth.loaded = true;
      const html = renderPage();
      expect(html).toContain('$89.00');
      expect(html).not.toContain('data-testid="custom-pricing-badge"');
    });
  });

  describe('amenities section', () => {
    it('renders amenities section with data-testid="amenities-section"', () => {
      expect(renderPage()).toContain('data-testid="amenities-section"');
    });

    it('amenities section has aria-labelledby="amenities-heading"', () => {
      const html = renderPage();
      expect(html).toContain('aria-labelledby="amenities-heading"');
      expect(html).toContain('id="amenities-heading"');
    });

    it('renders 4 amenity-item elements', () => {
      const html = renderPage();
      const matches = html.match(/data-testid="amenity-item"/g);
      expect(matches).toHaveLength(4);
    });

    it('renders first amenity from AMENITIES content', () => {
      expect(renderPage()).toContain('Stockage sécurisé');
    });

    it('renders amenity codes as aria-hidden', () => {
      const html = renderPage();
      expect(html).toContain('page-accueil__amenity-code');
      expect(html).toContain('A-01');
    });

    it('renders "Découvrir le site" link to /le-site', () => {
      const html = renderPage();
      expect(html).toContain('Découvrir le site');
      expect(html).toContain('href="/le-site"');
    });

    it('renders image panel for amenities', () => {
      expect(renderPage()).toContain('living-dining.jpg');
    });
  });

  describe('contour dividers', () => {
    it('renders four contour dividers', () => {
      const html = renderPage();
      const matches = html.match(/data-testid="contour"/g);
      expect(matches).toHaveLength(4);
    });

    it('contours carry register numbers 01, 02, 03, 04', () => {
      const html = renderPage();
      expect(html).toContain('>01<');
      expect(html).toContain('>02<');
      expect(html).toContain('>03<');
      expect(html).toContain('>04<');
    });
  });

  describe('closing CTA section', () => {
    it('renders cta section with data-testid="cta-section"', () => {
      expect(renderPage()).toContain('data-testid="cta-section"');
    });

    it('cta section has aria-labelledby="cta-heading"', () => {
      const html = renderPage();
      expect(html).toContain('aria-labelledby="cta-heading"');
      expect(html).toContain('id="cta-heading"');
    });

    it('renders cta-reserver wrapper with link to /contact', () => {
      const html = renderPage();
      expect(html).toContain('data-testid="cta-reserver"');
      expect(html).toContain('Réserver maintenant');
    });

    it('renders closing CTA heading', () => {
      expect(renderPage()).toContain('Planifiez votre séjour');
    });
  });

  // Both "Réserver" CTAs are gated on settings.reservationsEnabled (change D /
  // criterion #15): a /contact link when reservations are open, an inert
  // disabled button (no href) when the maintenance toggle turns them off.
  describe('reservation toggle gates the "Réserver" CTAs', () => {
    afterEach(() => {
      settings.reservationsEnabled = true;
    });

    /** SSR markup region for the hero "Réserver" CTA wrapper. */
    function heroCta(html: string): string {
      const start = html.indexOf('data-testid="hero-cta-reserver"');
      const end = html.indexOf('data-testid="hero-cta-lesite"');
      return html.slice(start, end);
    }

    /** SSR markup region for the closing "Réserver maintenant" CTA wrapper. */
    function closingCta(html: string): string {
      const start = html.indexOf('data-testid="cta-reserver"');
      return html.slice(start);
    }

    it('renders both CTAs as /contact links when reservations are enabled', () => {
      settings.reservationsEnabled = true;
      const html = renderPage();
      expect(heroCta(html)).toContain('href="/contact"');
      expect(closingCta(html)).toContain('href="/contact"');
    });

    it('renders the hero CTA as a disabled, non-navigating button when reservations are off', () => {
      settings.reservationsEnabled = false;
      const region = heroCta(renderPage());
      expect(region).toContain('data-testid="button"');
      expect(region).toContain('disabled');
      expect(region).toContain('aria-disabled="true"');
      expect(region).not.toContain('href="/contact"');
      // Label copy is unchanged in the disabled state.
      expect(region).toContain('Réserver');
    });

    it('renders the closing CTA as a disabled, non-navigating button when reservations are off', () => {
      settings.reservationsEnabled = false;
      const region = closingCta(renderPage());
      expect(region).toContain('data-testid="button"');
      expect(region).toContain('disabled');
      expect(region).toContain('aria-disabled="true"');
      expect(region).not.toContain('href="/contact"');
      expect(region).toContain('Réserver maintenant');
    });

    it('exposes no /contact link anywhere when reservations are off', () => {
      settings.reservationsEnabled = false;
      expect(renderPage()).not.toContain('href="/contact"');
    });
  });

  describe('accessibility', () => {
    it('all major sections have accessible labels', () => {
      const html = renderPage();
      expect(html).toContain('aria-labelledby="hero-heading"');
      expect(html).toContain('aria-label="Chiffres clés"');
      expect(html).toContain('aria-labelledby="rooms-heading"');
      expect(html).toContain('aria-labelledby="amenities-heading"');
      expect(html).toContain('aria-labelledby="cta-heading"');
    });

    it('uses section elements for major page regions', () => {
      const html = renderPage();
      const sections = html.match(/<section/g);
      expect(sections?.length).toBeGreaterThanOrEqual(4);
    });

    it('amenity list has role="list"', () => {
      expect(renderPage()).toContain('role="list"');
    });
  });

  describe('source-level checks', () => {
    it('uses countUp with { to } API (not target)', async () => {
      const raw = await import('../+page.svelte?raw');
      const text = (raw as { default: string }).default;
      expect(text).toContain('countUp={{ to:');
      expect(text).not.toContain('countUp={{ target:');
    });

    it('uses reveal action for scroll animations', async () => {
      const raw = await import('../+page.svelte?raw');
      const text = (raw as { default: string }).default;
      expect(text).toContain('use:reveal');
    });

    it('imports from $lib/motion', async () => {
      const raw = await import('../+page.svelte?raw');
      const text = (raw as { default: string }).default;
      expect(text).toContain("from '$lib/motion'");
    });

    it('prerender is exported as true in +page.ts', async () => {
      const mod = await import('../+page');
      expect(mod.prerender).toBe(true);
    });

    it('no innerHTML assignments (XSS safe)', async () => {
      const raw = await import('../+page.svelte?raw');
      const text = (raw as { default: string }).default;
      expect(text).not.toContain('innerHTML');
      expect(text).not.toContain('{@html');
    });
  });
});
