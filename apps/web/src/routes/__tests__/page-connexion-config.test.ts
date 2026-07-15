// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("page-connexion route config", () => {
  it("is server-rendered (SSR enabled)", async () => {
    const mod = await import("../connexion/+page");
    expect(mod.ssr).toBe(true);
  });

  it("does not opt into prerendering (forms POST credentials at runtime)", async () => {
    const mod = (await import("../connexion/+page")) as Record<string, unknown>;
    expect(mod.prerender).toBeUndefined();
  });
});
