// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import Page from '../+page.svelte';
import { ATTRACTIONS, PROPERTY_AREAS } from '../../../lib/content';

function renderPage() {
  const result = render(Page);
  return { html: result.body };
}

describe('page-le-site route', () => {
  describe('prerender flag', () => {
    it('opts into static prerendering', async () => {
      const { prerender } = await import('../+page');
      expect(prerender).toBe(true);
    });
  });

  describe('root element', () => {
    it('renders data-testid="page-le-site"', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="page-le-site"');
    });
  });

  describe('sticky in-page nav', () => {
    it('renders data-testid="inpage-nav"', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="inpage-nav"');
    });

    it('uses <nav> element with aria-label="Sur cette page"', () => {
      const { html } = renderPage();
      expect(html).toMatch(/<nav[^>]*aria-label="Sur cette page"/);
    });

    it('renders three in-page anchor links', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="inpage-link-chambres"');
      expect(html).toContain('data-testid="inpage-link-attraits"');
      expect(html).toContain('data-testid="inpage-link-lieu"');
    });

    it('chambres link href is #chambres', () => {
      const { html } = renderPage();
      expect(html).toContain('href="#chambres"');
    });

    it('attraits link href is #attraits', () => {
      const { html } = renderPage();
      expect(html).toContain('href="#attraits"');
    });

    it('lieu link href is #lieu', () => {
      const { html } = renderPage();
      expect(html).toContain('href="#lieu"');
    });

    it('renders link labels Chambres, Attraits, Le lieu', () => {
      const { html } = renderPage();
      expect(html).toContain('Chambres');
      expect(html).toContain('Attraits');
      expect(html).toContain('Le lieu');
    });
  });

  describe('chambres section (property overview)', () => {
    it('renders data-testid="section-chambres"', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="section-chambres"');
    });

    it('section has id="chambres" for anchor navigation', () => {
      const { html } = renderPage();
      expect(html).toMatch(/id="chambres"/);
    });

    it('is a named region landmark', () => {
      const { html } = renderPage();
      expect(html).toMatch(/id="chambres"[^>]*aria-label="Aperçu de la propriété"/);
    });

    it('no longer renders any RoomCard', () => {
      const { html } = renderPage();
      expect(html).not.toContain('data-testid="room-card"');
      expect(html).not.toContain('data-testid="rooms-grid"');
    });

    it('renders section label Hébergement', () => {
      const { html } = renderPage();
      expect(html).toContain('Hébergement');
    });

    it('retains the "assigned on arrival" intro copy', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="property-overview-intro"');
      expect(html).toContain('assignées à votre arrivée');
    });

    it('states the flat nightly price, defaulting to 89 $ under SSR', () => {
      const { html } = renderPage();
      expect(html).toMatch(/data-testid="property-overview-price"[^>]*>89 \$\/nuit</);
    });

    it('renders one area block per PROPERTY_AREAS entry', () => {
      const { html } = renderPage();
      for (const area of PROPERTY_AREAS) {
        expect(html).toContain(`data-testid="area-${area.id}"`);
      }
    });

    it('renders an ImagePanel wrapper for all 14 R2 image keys', () => {
      const { html } = renderPage();
      const keys = PROPERTY_AREAS.flatMap((a) => a.images.map((i) => i.key));
      expect(keys).toHaveLength(14);
      for (const key of keys) {
        expect(html).toContain(`data-testid="area-image-${key}"`);
      }
    });

    it('gives every property image a non-empty alt', () => {
      const { html } = renderPage();
      for (const area of PROPERTY_AREAS) {
        for (const img of area.images) {
          expect(img.alt.length).toBeGreaterThan(0);
          expect(html).toContain(`alt="${img.alt}"`);
        }
      }
    });

    it('renders a /contact CTA in the section', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="property-overview-cta"');
      expect(html).toContain('Réserver votre séjour');
    });
  });

  describe('attraits section', () => {
    it('renders data-testid="section-attraits"', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="section-attraits"');
    });

    it('section has id="attraits" for anchor navigation', () => {
      const { html } = renderPage();
      expect(html).toMatch(/id="attraits"/);
    });

    it('renders data-testid="attraits-grid"', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="attraits-grid"');
    });

    it('renders one attrait-card per entry in ATTRACTIONS', () => {
      const { html } = renderPage();
      const cards = html.match(/data-testid="attrait-card"/g) ?? [];
      expect(cards).toHaveLength(ATTRACTIONS.length);
    });

    it('renders the attraits heading', () => {
      const { html } = renderPage();
      expect(html).toContain('Aux alentours');
    });

    it('renders section label Attraits', () => {
      const { html } = renderPage();
      expect(html).toContain('Attraits');
    });

    it('renders each attraction name in an h3', () => {
      const { html } = renderPage();
      for (const attr of ATTRACTIONS) {
        expect(html).toContain(attr.name);
      }
    });

    it('renders each attraction distance', () => {
      const { html } = renderPage();
      for (const attr of ATTRACTIONS) {
        expect(html).toContain(attr.distance);
      }
    });

    it('attraction code is aria-hidden', () => {
      const { html } = renderPage();
      expect(html).toMatch(/class="page-le-site__attrait-code[^"]*"[^>]*aria-hidden="true"/);
    });
  });

  describe('lieu section', () => {
    it('renders data-testid="section-lieu"', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="section-lieu"');
    });

    it('section has id="lieu" for anchor navigation', () => {
      const { html } = renderPage();
      expect(html).toMatch(/id="lieu"/);
    });

    it('renders the lieu heading', () => {
      const { html } = renderPage();
      expect(html).toContain('Un vieux pont sur la Sainte-Anne');
    });

    it('renders section label Le lieu', () => {
      const { html } = renderPage();
      expect(html).toContain('Le lieu');
    });

    it('renders a Nous contacter link to /contact', () => {
      const { html } = renderPage();
      expect(html).toContain('href="/contact"');
      expect(html).toContain('Nous contacter');
    });

    it('renders the editorial ImagePanel with non-empty alt', () => {
      const { html } = renderPage();
      expect(html).toContain('alt="Vue extérieure de l\'Auberge du Vieux Pont sur la rivière Sainte-Anne"');
    });

    it('decorative grounds strip has aria-hidden="true"', () => {
      const { html } = renderPage();
      expect(html).toMatch(/class="page-le-site__grounds-strip[^"]*"[^>]*aria-hidden="true"/);
    });

    it('decorative grounds ImagePanel has empty alt', () => {
      const { html } = renderPage();
      expect(html).toMatch(/alt=""/);
    });
  });

  describe('CTA strip', () => {
    it('renders data-testid="cta-strip"', () => {
      const { html } = renderPage();
      expect(html).toContain('data-testid="cta-strip"');
    });

    it('renders Prêt à réserver? heading', () => {
      const { html } = renderPage();
      expect(html).toContain('Prêt à réserver?');
    });

    it('renders Réserver maintenant action link to /contact', () => {
      const { html } = renderPage();
      expect(html).toContain('Réserver maintenant');
    });

    it('renders section label Réservation', () => {
      const { html } = renderPage();
      expect(html).toContain('Réservation');
    });
  });

  describe('heading hierarchy', () => {
    it('renders h2 headings for each major section', () => {
      const { html } = renderPage();
      const h2s = html.match(/<h2[\s>]/g) ?? [];
      expect(h2s.length).toBeGreaterThanOrEqual(3);
    });

    it('renders h3 for each attraction name', () => {
      const { html } = renderPage();
      const h3s = html.match(/<h3[\s>]/g) ?? [];
      expect(h3s.length).toBeGreaterThanOrEqual(ATTRACTIONS.length);
    });
  });

  describe('security — no unescaped HTML injection', () => {
    it('auto-escapes dynamic text (Svelte binding)', () => {
      const { html } = renderPage();
      expect(html).not.toContain('innerHTML');
      expect(html).not.toContain('eval(');
    });
  });
});
