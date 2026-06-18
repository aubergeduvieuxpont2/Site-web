// A/B traffic-splitter for the concept-testing surface (dev.aubergeduvieuxpont.ca).
//
// Sticky-assigns each visitor to variant A or B by weight, then forwards the
// request (by fetch) to that variant's Worker and returns the response. The URL
// stays on `dev`, so the SPA's relative `/api/*` calls hit the shared API
// same-origin. `/api/*` never reaches this Worker — a more-specific
// `dev.aubergeduvieuxpont.ca/api/*` route sends it straight to the API Worker.

type Variant = "a" | "b";

interface Env {
  // Percentage of *new* visitors routed to variant A (0–100). Default 50.
  WEIGHT_A?: string;
  // Variant origins (overridable per environment); defaults to the subdomains.
  VARIANT_A_URL?: string;
  VARIANT_B_URL?: string;
}

const COOKIE = "ab_variant";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

function clampWeight(raw: string | undefined): number {
  const n = Number(raw ?? "50");
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, n));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origins: Record<Variant, string> = {
      a: env.VARIANT_A_URL ?? "https://a.aubergeduvieuxpont.ca",
      b: env.VARIANT_B_URL ?? "https://b.aubergeduvieuxpont.ca",
    };

    const existing = readCookie(request.headers.get("Cookie"), COOKIE);
    let variant: Variant;
    let assigned = false;
    if (existing === "a" || existing === "b") {
      variant = existing;
    } else {
      variant = Math.random() * 100 < clampWeight(env.WEIGHT_A) ? "a" : "b";
      assigned = true;
    }

    const target = origins[variant] + url.pathname + url.search;

    let upstream: Response;
    try {
      // Reuse method/headers/body from the original request.
      upstream = await fetch(new Request(target, request));
    } catch {
      return new Response(`A/B upstream unavailable (variant ${variant}).`, {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Clone so headers are mutable.
    const resp = new Response(upstream.body, upstream);
    resp.headers.set("X-AB-Variant", variant);
    if (assigned) {
      resp.headers.append(
        "Set-Cookie",
        `${COOKIE}=${variant}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax`,
      );
    }
    return resp;
  },
};
