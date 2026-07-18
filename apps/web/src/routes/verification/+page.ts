// The verification page reads a one-time token from the URL query string and
// posts it to `/api/auth/verify-email` at runtime, so it must run client-side.
// Server-rendering would expose the token to the SSR request log, and there is
// nothing to prerender — every visit carries a different token.
export const ssr = false;
export const prerender = false;
