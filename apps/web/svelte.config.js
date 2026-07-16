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
  },
};
