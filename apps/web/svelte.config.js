import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

export default {
  // Enables TypeScript / PostCSS preprocessing inside <script> and <style>.
  preprocess: vitePreprocess(),
};
