// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { validateKey, resolveContentType } from './utils';
import { GET } from './[...key]/+server';

describe('validateKey', () => {
  it('rejects traversal, absolute, and backslash keys', () => {
    for (const bad of ['', '../etc', '/abs', 'a\\b', 'a b', 'a..b']) {
      expect(() => validateKey(bad)).toThrow();
    }
  });

  it('lowercases and returns valid keys', () => {
    expect(validateKey('Rooms/Photo.JPG')).toBe('rooms/photo.jpg');
  });
});

describe('resolveContentType', () => {
  it('passes through allow-listed image types', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']) {
      expect(resolveContentType(t)).toBe(t);
    }
  });

  it('normalizes case and strips parameters for allow-listed types', () => {
    expect(resolveContentType('IMAGE/JPEG')).toBe('image/jpeg');
    expect(resolveContentType('image/png; charset=binary')).toBe('image/png');
  });

  it('neutralizes non-allow-listed / active types to octet-stream', () => {
    for (const t of ['text/html', 'image/svg+xml', 'application/javascript', 'image/x-icon']) {
      expect(resolveContentType(t)).toBe('application/octet-stream');
    }
  });

  it('neutralizes a missing content-type', () => {
    expect(resolveContentType(undefined)).toBe('application/octet-stream');
    expect(resolveContentType(null)).toBe('application/octet-stream');
    expect(resolveContentType('')).toBe('application/octet-stream');
  });
});

function makePlatform(contentType: string | undefined) {
  return {
    env: {
      IMG: {
        async get(_key: string) {
          return {
            body: new ReadableStream(),
            httpMetadata: contentType === undefined ? {} : { contentType },
          };
        },
      },
    },
  };
}

// The GET handler only reads `params.key` and `platform`, so a partial cast is safe here.
/* eslint-disable @typescript-eslint/no-explicit-any */
async function callGet(key: string, contentType: string | undefined) {
  return GET({ params: { key }, platform: makePlatform(contentType) } as any);
}

describe('img GET handler', () => {
  it('always sets nosniff, inline disposition, and immutable cache on a served object', async () => {
    const res = await callGet('rooms/a.jpg', 'image/jpeg');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Content-Disposition')).toBe('inline');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
  });

  it('passes an allow-listed stored image/* type through', async () => {
    const res = await callGet('rooms/a.webp', 'image/webp');
    expect(res.headers.get('Content-Type')).toBe('image/webp');
  });

  it('neutralizes a non-allow-listed stored type to octet-stream', async () => {
    const html = await callGet('rooms/evil.html', 'text/html');
    expect(html.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(html.headers.get('X-Content-Type-Options')).toBe('nosniff');

    const svg = await callGet('rooms/evil.svg', 'image/svg+xml');
    expect(svg.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('rejects invalid keys with a 400', async () => {
    const res = await callGet('../secret', 'image/jpeg');
    expect(res.status).toBe(400);
  });

  it('falls back to picsum (302) when the bucket has no object', async () => {
    const res = (await GET({
      params: { key: 'missing.jpg' },
      platform: { env: { IMG: { async get() { return null; } } } },
    } as any)) as Response;
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('picsum.photos');
  });
});
/* eslint-enable @typescript-eslint/no-explicit-any */
