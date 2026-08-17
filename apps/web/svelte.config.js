import adapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter(),
    // Inline route CSS into the prerendered HTML instead of serving it as
    // separate render-blocking stylesheet requests.
    inlineStyleThreshold: 65536,
    prerender: {
      handleHttpError: 'warn',
    },
    // CSP is generated HERE, not in hooks.server.ts, because SvelteKit emits an
    // inline bootstrap script (`__sveltekit_<hash> = {...}`) that starts
    // hydration. A hand-written `script-src 'self'` blocks it, and the page
    // never becomes interactive — which is exactly what shipped: every
    // non-prerendered route was dead on direct navigation or hard reload.
    //
    // `mode: 'hash'` makes SvelteKit compute the sha256 of its own inline
    // scripts at build time and append them to script-src, so hydration runs
    // WITHOUT reintroducing 'unsafe-inline'. Nonces would need a per-request
    // value, which prerendered pages cannot have.
    //
    // Directives mirror the previous hooks.server.ts set exactly; only the
    // build-time hashes are added.
    csp: {
      mode: 'hash',
      directives: {
        'default-src': ['self'],
        'img-src': ['self', 'data:', 'https:'],
        // Svelte/Vite inline runtime styles and Tailwind utilities.
        'style-src': ['self', 'unsafe-inline'],
        // Stripe's loader is external; SvelteKit's inline bootstrap is covered
        // by the auto-injected hashes.
        'script-src': ['self', 'https://js.stripe.com'],
        // Same-origin /api/* plus api.stripe.com for embedded checkout.
        'connect-src': ['self', 'https:'],
        // Stripe Embedded Checkout mounts iframes from these origins.
        'frame-src': ['https://js.stripe.com', 'https://*.stripe.com'],
        'frame-ancestors': ['none'],
        'base-uri': ['self'],
        'object-src': ['none'],
      },
    },
  },
};
