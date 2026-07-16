// The reset page reads a one-time token from the URL query string and posts a
// new password to `/api/auth/reset` at runtime, so it must run client-side.
// Server-rendering would expose the token to the SSR request log, and there is
// nothing to prerender — every visit carries a different token.
export const ssr = false;
export const prerender = false;
