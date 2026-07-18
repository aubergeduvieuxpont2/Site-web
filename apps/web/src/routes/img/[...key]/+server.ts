import type { RequestHandler } from './$types';
import { validateKey, resolveContentType } from '../utils';

export const prerender = false;

interface R2ObjectLike {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
}
interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
}

export const GET: RequestHandler = async ({ params, platform }) => {
  let key: string;
  try {
    key = validateKey(params.key);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid image key' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bucket = (platform as { env?: { IMG?: R2BucketLike } } | undefined)
    ?.env?.IMG;
  const obj = bucket ? await bucket.get(key) : null;

  if (obj) {
    return new Response(obj.body, {
      status: 200,
      headers: {
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Type': resolveContentType(obj.httpMetadata?.contentType),
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
      },
    });
  }

  const picsum = `https://picsum.photos/seed/${encodeURIComponent(key)}/1200/800`;
  return new Response(null, {
    status: 302,
    headers: { Location: picsum },
  });
};
