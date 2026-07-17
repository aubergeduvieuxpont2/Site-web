import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "hbs-raw",
      transform(code, id) {
        if (!id.endsWith(".hbs")) return null;
        return { code: `export default ${JSON.stringify(code)};`, map: null };
      },
    },
  ],
  test: {
    globals: true,
    environment: "node",
  },
});
