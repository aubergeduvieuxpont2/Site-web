// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import RoomCard from '../RoomCard.svelte';

const mockRoom = {
  name: 'La Chambre du Quart',
  description: 'Conçue pour ceux qui dorment le jour.',
  imgKey: 'bedroom.jpg',
  picsumSeed: 17,
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

    it('does not render a CTA button', () => {
      const { html } = renderCard();
      expect(html).not.toContain('data-testid="room-card-cta"');
      expect(html).not.toContain('Réserver');
    });

    it('renders an h3 inside the article', () => {
      const { html } = renderCard();
      expect(html).toMatch(/<h3/);
    });
  });

  describe('room name', () => {
    it('displays the room name in h3', () => {
      const { html } = renderCard();
      expect(html).toContain('La Chambre du Quart');
    });

    it('displays a different room name when prop changes', () => {
      const { html } = renderCard({ ...mockRoom, name: 'La Chambre de la Rivière' });
      expect(html).toContain('La Chambre de la Rivière');
    });
  });

  describe('room description', () => {
    it('displays the room description', () => {
      const { html } = renderCard();
      expect(html).toContain('Conçue pour ceux qui dorment le jour.');
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
    it('renders flat price with $/nuit suffix from settings', () => {
      const { html } = renderCard();
      expect(html).toContain('89 $/nuit');
    });

    it('price is the same for all rooms (flat rate)', () => {
      const { html } = renderCard({ ...mockRoom, name: 'Le Gîte Familial' });
      expect(html).toContain('89 $/nuit');
    });

    it('price is inside the room-card-price element', () => {
      const { html } = renderCard();
      expect(html).toMatch(/data-testid="room-card-price"[^>]*>[^<]*89 \$\/nuit/s);
    });
  });

  describe('image', () => {
    it('renders ImagePanel with the room imgKey', () => {
      const { html } = renderCard();
      expect(html).toContain('src="/img/bedroom.jpg"');
    });

    it('passes alt text equal to room name', () => {
      const { html } = renderCard();
      expect(html).toContain('alt="La Chambre du Quart"');
    });

    it('sets aspect ratio to 4/3', () => {
      const { html } = renderCard();
      expect(html).toContain('--aspect: 4/3');
    });

    it('sets picsum fallback with picsumSeed', () => {
      const { html } = renderCard();
      expect(html).toContain('https://picsum.photos/seed/17/1200/800');
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
