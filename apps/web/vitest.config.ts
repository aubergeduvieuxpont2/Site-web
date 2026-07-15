import { defineConfig } from "vitest/config";
import { sveltekit } from "@sveltejs/kit/vite";

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    globals: true,
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        resources: "usable",
      },
    },
    setupFiles: ["./vitest.setup.ts"],
    testTimeout: 10000,
  },
  resolve: {
    conditions: ["browser"],
  },
});
