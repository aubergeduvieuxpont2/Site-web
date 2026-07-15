// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import RoomCard from '../RoomCard.svelte';

const mockRoom = {
  name: "Le Dortoir de l'Équipe",
  description: 'Pour les crews et les pelotons.',
  pricePerNight: 39,
  imgKey: 'bunkroom',
  picsumSeed: 42,
  slug: 'dortoir-equipe',
};

function renderCard(room = mockRoom) {
  const result = render(RoomCard, { props: { room } });
  return { html: result.body };
}

describe('RoomCard (SSR)', () => {
  describe('DOM structure', () => {
    it('renders an article element', () => {
      const { html } = renderCard();
      expect(html).toMatch(/<article/);
    });

    it('renders data-testid="room-card" on article', () => {
      const { html } = renderCard();
      expect(html).toContain('data-testid="room-card"');
    });

    it('renders data-testid="room-card-name" on h3', () => {
      const { html } = renderCard();
      expect(html).toContain('data-testid="room-card-name"');
    });

    it('renders data-testid="room-card-description" on p', () => {
      const { html } = renderCard();
      expect(html).toContain('data-testid="room-card-description"');
    });

    it('renders data-testid="room-card-price" on span', () => {
      const { html } = renderCard();
      expect(html).toContain('data-testid="room-card-price"');
    });

    it('renders data-testid="room-card-cta" wrapper', () => {
      const { html } = renderCard();
      expect(html).toContain('data-testid="room-card-cta"');
    });

    it('renders an h3 inside the article', () => {
      const { html } = renderCard();
      expect(html).toMatch(/<h3/);
    });
  });

  describe('room name', () => {
    it('displays the room name in h3', () => {
      const { html } = renderCard();
      expect(html).toContain("Le Dortoir de l'Équipe");
    });

    it('displays a different room name when prop changes', () => {
      const { html } = renderCard({ ...mockRoom, name: 'La Chambre du Quart' });
      expect(html).toContain('La Chambre du Quart');
    });
  });

  describe('room description', () => {
    it('displays the room description', () => {
      const { html } = renderCard();
      expect(html).toContain('Pour les crews et les pelotons.');
    });

    it('auto-escapes HTML in description (XSS safe)', () => {
      const xss = '<script>alert("xss")</script>';
      const { html } = renderCard({ ...mockRoom, description: xss });
      expect(html).not.toContain('<script>alert');
      // Svelte SSR escapes < to &lt; but leaves > unescaped in text nodes
      expect(html).toContain('&lt;script>');
    });
  });

  describe('price label', () => {
    it('renders price with $/nuit suffix', () => {
      const { html } = renderCard();
      expect(html).toContain('39 $/nuit');
    });

    it('renders correct price for a different room', () => {
      const { html } = renderCard({ ...mockRoom, pricePerNight: 149 });
      expect(html).toContain('149 $/nuit');
    });

    it('price is inside the room-card-price element', () => {
      const { html } = renderCard();
      expect(html).toMatch(/data-testid="room-card-price"[^>]*>[^<]*39 \$\/nuit/s);
    });
  });

  describe('CTA button', () => {
    it('renders a link in the CTA region', () => {
      const { html } = renderCard();
      expect(html).toMatch(/data-testid="room-card-cta"[\s\S]*<a/);
    });

    it('CTA link points to /contact?chambre=<slug>', () => {
      const { html } = renderCard();
      expect(html).toContain('href="/contact?chambre=dortoir-equipe"');
    });

    it('URL-encodes the slug to prevent injection', () => {
      const { html } = renderCard({ ...mockRoom, slug: 'chambre spéciale' });
      expect(html).toContain('href="/contact?chambre=chambre%20sp%C3%A9ciale"');
    });

    it('renders "Réserver" as CTA text', () => {
      const { html } = renderCard();
      expect(html).toContain('Réserver');
    });
  });

  describe('image', () => {
    it('renders ImagePanel with the room imgKey', () => {
      const { html } = renderCard();
      expect(html).toContain('src="/img/bunkroom"');
    });

    it('passes alt text equal to room name', () => {
      const { html } = renderCard();
      expect(html).toContain("alt=\"Le Dortoir de l'Équipe\"");
    });

    it('sets aspect ratio to 4/3', () => {
      const { html } = renderCard();
      expect(html).toContain('--aspect: 4/3');
    });

    it('sets picsum fallback with picsumSeed', () => {
      const { html } = renderCard();
      expect(html).toContain('https://picsum.photos/seed/42/1200/800');
    });
  });

  describe('accessibility', () => {
    it('uses article element as landmark', () => {
      const { html } = renderCard();
      expect(html).toMatch(/<article[^>]*data-testid="room-card"/);
    });

    it('h3 provides accessible card name', () => {
      const { html } = renderCard();
      const h3Match = html.match(/<h3[^>]*data-testid="room-card-name"[^>]*>([\s\S]*?)<\/h3>/);
      expect(h3Match).toBeTruthy();
    });
  });
});
