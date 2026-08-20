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
        //
        // static.cloudflareinsights.com serves the Web Analytics beacon, which
        // Cloudflare injects into every response when Web Analytics is enabled
        // on the zone. It is not referenced anywhere in this codebase, so
        // without listing it here the browser blocks it on every page load.
        // If the analytics are not wanted, the cleaner fix is to disable Web
        // Analytics in the Cloudflare dashboard and drop this entry — that
        // removes the third-party script rather than permitting it.
        'script-src': [
          'self',
          'https://js.stripe.com',
          'https://static.cloudflareinsights.com',
        ],
        // Svelte 5 delegates events through inline handler ATTRIBUTES
        // (`this.__e=event`). Those are governed by script-src-attr, which
        // does NOT inherit script-src's hashes, so without this the browser
        // blocks them and some handlers silently never fire — the same class
        // of failure as the hydration bug, and just as invisible.
        //
        // 'unsafe-hashes' on its own permits NOTHING — it only makes hashes
        // eligible to match attribute handlers, so the hash must be listed
        // too. SvelteKit does not generate hashes for attributes (only for its
        // inline bootstrap), hence the literal below.
        //
        // The value is sha256 of exactly `this.__e=event`, which is Svelte 5's
        // delegated-handler source and is byte-identical for every such
        // handler — one hash covers all of them. Verified against the hash the
        // browser itself reported when blocking it.
        //
        // Meaningfully narrower than 'unsafe-inline': only this exact handler
        // string is permitted, not arbitrary inline script. If a Svelte
        // upgrade changes that source, handlers break loudly in the console
        // rather than silently — re-derive the hash from the reported value.
        'script-src-attr': [
          'unsafe-hashes',
          'sha256-7dQwUgLau1NFCCGjfn9FsYptB6ZtWxJin6VohGIu20I=',
        ],
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
