import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { reveal, revealStagger, countUp } from '../motion';

// Mock matchMedia for prefers-reduced-motion
const mockMatchMedia = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
};

describe('reveal', () => {
  let container: HTMLElement;
  let element: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    element = document.createElement('div');
    container.appendChild(element);
    document.body.appendChild(container);
    mockMatchMedia(false);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  it('sets initial opacity to 0 by default', () => {
    reveal(element);
    expect(element.style.opacity).toBe('0');
  });

  it('respects prefers-reduced-motion by setting opacity to 1', () => {
    mockMatchMedia(true);
    reveal(element);
    expect(element.style.opacity).toBe('1');
  });

  it('returns destroy function', () => {
    const result = reveal(element);
    expect(result).toHaveProperty('destroy');
    expect(typeof result.destroy).toBe('function');
  });

  it('accepts custom y offset parameter', () => {
    reveal(element, { y: 32 });
    expect(element.style.opacity).toBe('0');
  });

  it('accepts custom x offset parameter', () => {
    reveal(element, { x: 16 });
    expect(element.style.opacity).toBe('0');
  });

  it('accepts custom duration parameter', () => {
    reveal(element, { duration: 1.2 });
    expect(element.style.opacity).toBe('0');
  });

  it('accepts custom delay parameter', () => {
    reveal(element, { delay: 0.2 });
    expect(element.style.opacity).toBe('0');
  });

  it('accepts custom amount threshold parameter', () => {
    reveal(element, { amount: 0.5 });
    expect(element.style.opacity).toBe('0');
  });
});

describe('revealStagger', () => {
  let container: HTMLElement;
  let parent: HTMLElement;
  let children: HTMLElement[];

  beforeEach(() => {
    container = document.createElement('div');
    parent = document.createElement('ul');
    children = [];
    for (let i = 0; i < 3; i++) {
      const child = document.createElement('li');
      children.push(child);
      parent.appendChild(child);
    }
    container.appendChild(parent);
    document.body.appendChild(container);
    mockMatchMedia(false);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  it('sets all children to opacity 0 by default', () => {
    revealStagger(parent);
    children.forEach((child) => {
      expect(child.style.opacity).toBe('0');
    });
  });

  it('respects prefers-reduced-motion by setting all children to opacity 1', () => {
    mockMatchMedia(true);
    revealStagger(parent);
    children.forEach((child) => {
      expect(child.style.opacity).toBe('1');
    });
  });

  it('returns destroy function', () => {
    const result = revealStagger(parent);
    expect(result).toHaveProperty('destroy');
    expect(typeof result.destroy).toBe('function');
  });

  it('accepts custom selector parameter', () => {
    const customChild = document.createElement('span');
    customChild.className = 'reveal-item';
    parent.appendChild(customChild);

    revealStagger(parent, { selector: '.reveal-item' });
    expect(customChild.style.opacity).toBe('0');
  });

  it('accepts custom y offset parameter', () => {
    revealStagger(parent, { y: 32 });
    children.forEach((child) => {
      expect(child.style.opacity).toBe('0');
    });
  });

  it('accepts custom duration parameter', () => {
    revealStagger(parent, { duration: 1.2 });
    children.forEach((child) => {
      expect(child.style.opacity).toBe('0');
    });
  });

  it('accepts custom each stagger parameter', () => {
    revealStagger(parent, { each: 0.12 });
    children.forEach((child) => {
      expect(child.style.opacity).toBe('0');
    });
  });

  it('accepts custom amount threshold parameter', () => {
    revealStagger(parent, { amount: 0.5 });
    children.forEach((child) => {
      expect(child.style.opacity).toBe('0');
    });
  });
});

describe('countUp', () => {
  let container: HTMLElement;
  let element: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    element = document.createElement('span');
    container.appendChild(element);
    document.body.appendChild(container);
    mockMatchMedia(false);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.clearAllMocks();
  });

  it('sets initial text to from value with suffix', () => {
    countUp(element, { to: 100, from: 0, suffix: ' m' });
    expect(element.textContent).toBe('0 m');
  });

  it('sets initial text to from value with prefix', () => {
    countUp(element, { to: 100, from: 50, prefix: '€ ' });
    expect(element.textContent).toBe('€ 50');
  });

  it('sets initial text to from value with prefix and suffix', () => {
    countUp(element, { to: 100, from: 0, prefix: '€ ', suffix: '/nuit' });
    expect(element.textContent).toBe('€ 0/nuit');
  });

  it('respects prefers-reduced-motion by setting to final value', () => {
    mockMatchMedia(true);
    countUp(element, { to: 1200, from: 0, suffix: ' m' });
    expect(element.textContent).toBe('1200 m');
  });

  it('formats number with French locale', () => {
    mockMatchMedia(true);
    countUp(element, { to: 1234, from: 0 });
    const formatted = (1234).toLocaleString('fr-CA');
    expect(element.textContent).toBe(formatted);
  });

  it('accepts custom duration parameter', () => {
    countUp(element, { to: 100, duration: 2.0 });
    expect(element.textContent).toBe('0');
  });

  it('defaults from to 0 when not provided', () => {
    countUp(element, { to: 100 });
    expect(element.textContent).toBe('0');
  });

  it('returns destroy function', () => {
    const result = countUp(element, { to: 100 });
    expect(result).toHaveProperty('destroy');
    expect(typeof result.destroy).toBe('function');
  });

  it('handles zero target value', () => {
    mockMatchMedia(true);
    countUp(element, { to: 0, from: 100 });
    expect(element.textContent).toBe('0');
  });

  it('handles negative target value', () => {
    mockMatchMedia(true);
    countUp(element, { to: -50, from: 0 });
    expect(element.textContent).toBe('-50');
  });
});
