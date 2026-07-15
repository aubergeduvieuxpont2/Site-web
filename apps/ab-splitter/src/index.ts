// A/B traffic-splitter for the concept-testing surface (dev.aubergeduvieuxpont.ca).
//
// Sticky-assigns each visitor to variant A or B by weight, then forwards the
// request to that variant's Worker via a SERVICE BINDING and returns the
// response. The URL stays on `dev`, so the SPA's relative `/api/*` calls hit
// the shared API same-origin. `/api/*` never reaches this Worker — a more-
// specific `dev.aubergeduvieuxpont.ca/api/*` route sends it to the API Worker.
//
// Service bindings (not fetch-by-hostname) are used because a same-zone Worker
// subrequest to a variant's custom-domain route is not reliably intercepted by
// that route (it falls through to the placeholder origin → HTTP 522). A binding
// invokes the variant Worker directly. NOTE: this couples deploy order — the
// variant Workers (site-web-web-a / -b) must exist before the splitter deploys.

type Variant = "a" | "b";

interface Env {
  // Percentage of *new* visitors routed to variant A (0–100). Default 50.
  WEIGHT_A?: string;
  // Service bindings to the variant Workers.
  VARIANT_A: Fetcher;
  VARIANT_B: Fetcher;
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
    const existing = readCookie(request.headers.get("Cookie"), COOKIE);
    let variant: Variant;
    let assigned = false;
    if (existing === "a" || existing === "b") {
      variant = existing;
    } else {
      variant = Math.random() * 100 < clampWeight(env.WEIGHT_A) ? "a" : "b";
      assigned = true;
    }

    const upstream = variant === "a" ? env.VARIANT_A : env.VARIANT_B;

    let response: Response;
    try {
      response = await upstream.fetch(request);
    } catch {
      return new Response(`A/B upstream unavailable (variant ${variant}).`, {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // Clone so headers are mutable.
    const resp = new Response(response.body, response);
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
