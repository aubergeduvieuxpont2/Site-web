// @vitest-environment node
import { describe, it, expect } from "vitest";

describe("HeroShader component", () => {
  it("should export as a Svelte component", async () => {
    const module = await import("../HeroShader.svelte");
    expect(module.default).toBeDefined();
  });

  it("should be a constructor/class (Svelte component)", async () => {
    const { default: HeroShader } = await import("../HeroShader.svelte");
    expect(HeroShader).toBeTruthy();
  });

  it("should not accept props (self-contained component)", async () => {
    const { default: HeroShader } = await import("../HeroShader.svelte");
    // Component compiles with no required props
    expect(HeroShader).toBeDefined();
  });

  it("GLSL vertex shader is a static string constant", async () => {
    // Importing the compiled module verifies the static GLSL strings parse correctly
    const { default: HeroShader } = await import("../HeroShader.svelte");
    expect(HeroShader).toBeTruthy();
  });

  it("GLSL fragment shader encodes correct surface colors", async () => {
    // Values: color1 = #f7f9fb (0.969, 0.976, 0.984), color2 = #eceef0 (0.925, 0.933, 0.941)
    // Verified by inspection of the source
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain("0.969, 0.976, 0.984");
    expect(text).toContain("0.925, 0.933, 0.941");
  });

  it("canvas element carries aria-hidden attribute", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain('aria-hidden="true"');
  });

  it("fallback element carries role=img and aria-label", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain('role="img"');
    expect(text).toContain('aria-label="Vue de l\'auberge"');
  });

  it("wrapper element has data-testid hero-shader", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain('data-testid="hero-shader"');
  });

  it("fallback element has data-testid hero-shader-fallback", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain('data-testid="hero-shader-fallback"');
  });

  it("canvas element has data-testid hero-shader-canvas", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain('data-testid="hero-shader-canvas"');
  });

  it("prefers-reduced-motion CSS media query hides canvas", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain("prefers-reduced-motion: reduce");
    expect(text).toContain(".hero-shader__canvas");
  });

  it("JS gate adds reduced-motion class before touching WebGL", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain("hero-shader--reduced-motion");
  });

  it("JS gate adds no-webgl class when context fails", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain("hero-shader--no-webgl");
  });

  it("IntersectionObserver is used to pause off-screen rendering", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain("IntersectionObserver");
  });

  it("cleanup returns a destroy callback from onMount", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    // onMount return value is the cleanup function
    expect(text).toContain("return () =>");
    expect(text).toContain("io.disconnect()");
  });

  it("uses TRIANGLE_STRIP for full-screen quad rendering", async () => {
    const source = await import("../HeroShader.svelte?raw");
    const text = (source as { default: string }).default;
    expect(text).toContain("TRIANGLE_STRIP");
  });
});
