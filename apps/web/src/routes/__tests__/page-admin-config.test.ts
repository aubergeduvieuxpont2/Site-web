// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("page-admin route config", () => {
  it("disables SSR (client-rendered, role-gated at runtime)", async () => {
    const mod = await import("../admin/+page");
    expect(mod.ssr).toBe(false);
  });

  it("does not opt into prerendering", async () => {
    const mod = (await import("../admin/+page")) as Record<string, unknown>;
    // A CSR admin dashboard must never be statically prerendered.
    expect(mod.prerender).toBeUndefined();
  });
});
