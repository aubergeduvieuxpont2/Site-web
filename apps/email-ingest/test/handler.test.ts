import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleEmail } from "../src/index";

const FIXTURES = join(__dirname, "fixtures");

// A domain-aligned DKIM pass for airbnb.com — the default "verified" header so
// the happy-path tests reach reservation creation.
const AIRBNB_AUTH = "mx.google.com; dkim=pass header.d=airbnb.com; spf=pass smtp.mailfrom=bounce.airbnb.com";

function rawEmail(
  from: string,
  subject: string,
  textBody: string,
  authResults: string | null = AIRBNB_AUTH,
): Uint8Array {
  // Minimal RFC 5322 message; postal-mime handles UTF-8 8bit bodies.
  const lines = [
    `From: Airbnb <${from}>`,
    `To: bookings@aubergeduvieuxpont.ca`,
    `Subject: ${subject}`,
    `Date: Fri, 17 Jul 2026 10:13:00 -0400`,
  ];
  if (authResults) lines.push(`Authentication-Results: ${authResults}`);
  lines.push(
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ``,
    textBody,
  );
  return new TextEncoder().encode(lines.join("\r\n"));
}

function makeMessage(
  from: string,
  subject: string,
  textBody: string,
  authResults: string | null = AIRBNB_AUTH,
) {
  const raw = rawEmail(from, subject, textBody, authResults);
  return {
    from,
    to: "bookings@aubergeduvieuxpont.ca",
    raw: new Response(raw).body!, // ReadableStream, like the runtime provides
    rawSize: raw.byteLength,
    headers: new Headers(),
    forward: vi.fn(async () => {}),
    setReject: vi.fn(),
    reply: vi.fn(async () => {}),
  } as any;
}

function headerFrom(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (typeof input !== "string" && input instanceof Request) {
    return input.headers.get("X-Internal-Auth");
  }
  const h = init?.headers as Record<string, string> | undefined;
  return h?.["X-Internal-Auth"] ?? null;
}

const OTA_SECRET = "ota-secret";

function makeEnv() {
  const calls: { url: string; body: any; authHeader: string | null }[] = [];
  const env = {
    FORWARD_TO: "aubergeduvieuxpont2@hotmail.com",
    INTERNAL_OTA_SECRET: OTA_SECRET,
    API: {
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const bodyText =
          typeof input !== "string" && input instanceof Request
            ? await input.clone().text()
            : String(init?.body ?? "");
        calls.push({ url, body: JSON.parse(bodyText), authHeader: headerFrom(input, init) });
        return new Response(JSON.stringify({ ok: true }), { status: 202 });
      }),
    },
  } as any;
  return { env, calls };
}

const airbnbText = readFileSync(join(FIXTURES, "airbnb-confirmation.txt"), "utf8");

describe("handleEmail", () => {
  it("forwards first, then posts a parsed Airbnb booking to the API", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);

    expect(message.forward).toHaveBeenCalledWith("aubergeduvieuxpont2@hotmail.com");
    expect(message.forward.mock.invocationCallOrder[0]).toBeLessThan(
      (env.API.fetch as any).mock.invocationCallOrder[0],
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://api/internal/ota-bookings");
    expect(calls[0].body.status).toBe("parsed");
    expect(calls[0].body.source).toBe("airbnb");
    expect(calls[0].body.externalRef).toBe("HM45MDTHZ4");
    expect(calls[0].body.firstName).toBe("Jean");
  });

  it("posts ignored for an Airbnb pending request", async () => {
    const requestText = readFileSync(join(FIXTURES, "airbnb-request.txt"), "utf8");
    const message = makeMessage(
      "automated@airbnb.com",
      "En attente : demande de réservation concernant l'annonce Auberge du vieux pont pour 30–31 juil. 2026",
      requestText,
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(message.forward).toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0].body.status).toBe("ignored");
    expect(calls[0].body.provider).toBe("airbnb");
  });

  it("posts parse_failed when a booking email cannot be parsed", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      "corps inattendu sans aucun des champs habituels",
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.status).toBe("parse_failed");
    expect(calls[0].body.provider).toBe("airbnb");
  });

  it("rejects unknown senders — no forward, no API call", async () => {
    const message = makeMessage("news@example.com", "Promo", "hello", null);
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(message.setReject).toHaveBeenCalled();
    expect(message.forward).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("T-EI-001c: forwards but creates NO reservation when auth is missing", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
      null, // no Authentication-Results header
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(message.forward).toHaveBeenCalledWith("aubergeduvieuxpont2@hotmail.com");
    // No parsed booking POST (in fact no internal POST at all).
    expect(calls).toHaveLength(0);
    expect(calls.some((c) => c.body.status === "parsed")).toBe(false);
  });

  it("T-EI-001c: forwards but creates NO reservation when auth fails / is unaligned", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
      "mx.google.com; dkim=fail header.d=airbnb.com; spf=pass smtp.mailfrom=evil.com",
    );
    const { env, calls } = makeEnv();
    await handleEmail(message, env);
    expect(message.forward).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("T-EI-003a: attaches X-Internal-Auth on every internal POST", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
    );
    const calls: { url: string; body: any; authHeader: string | null }[] = [];
    const env = {
      FORWARD_TO: "aubergeduvieuxpont2@hotmail.com",
      INTERNAL_OTA_SECRET: OTA_SECRET,
      API: {
        fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          const bodyText =
            typeof input !== "string" && input instanceof Request
              ? await input.clone().text()
              : String(init?.body ?? "");
          calls.push({ url, body: JSON.parse(bodyText), authHeader: headerFrom(input, init) });
          // Reject the first (parsed) POST so a fallback POST also fires:
          // both must carry the header.
          return calls.length === 1
            ? new Response("bad request", { status: 400 })
            : new Response(JSON.stringify({ ok: true }), { status: 202 });
        }),
      },
    } as any;

    await handleEmail(message, env);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.authHeader).toBe(OTA_SECRET);
    }
  });

  it("still forwards OTA mail when MIME parsing fails, using the envelope sender", async () => {
    const raw = new ReadableStream({
      start(controller) {
        controller.error(new Error("broken stream"));
      },
    });
    const message = {
      from: "automated@airbnb.com",
      to: "bookings@aubergeduvieuxpont.ca",
      raw,
      rawSize: 0,
      headers: new Headers(),
      forward: vi.fn(async () => {}),
      setReject: vi.fn(),
      reply: vi.fn(async () => {}),
    } as any;
    const { env, calls } = makeEnv();
    await expect(handleEmail(message, env)).resolves.toBeUndefined();
    expect(message.forward).toHaveBeenCalledWith("aubergeduvieuxpont2@hotmail.com");
    expect(message.setReject).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("falls back to a parse_failed report when the API rejects a parsed booking", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
    );
    const calls: { url: string; body: any }[] = [];
    const env = {
      FORWARD_TO: "aubergeduvieuxpont2@hotmail.com",
      INTERNAL_OTA_SECRET: OTA_SECRET,
      API: {
        fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : (input as Request).url;
          const bodyText =
            typeof input !== "string" && input instanceof Request
              ? await input.clone().text()
              : String(init?.body ?? "");
          calls.push({ url, body: JSON.parse(bodyText) });
          if (calls.length === 1) {
            return new Response("bad request", { status: 400 });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 202 });
        }),
      },
    } as any;

    await handleEmail(message, env);

    expect(calls).toHaveLength(2);
    expect(calls[0].body.status).toBe("parsed");
    expect(calls[1].body.status).toBe("parse_failed");
    expect(calls[1].body.provider).toBe("airbnb");
    expect(calls[1].body.error).toContain("400");
  });

  it("never throws after a successful forward, even if the API is down", async () => {
    const message = makeMessage(
      "automated@airbnb.com",
      "Réservation confirmée : Jean Tremblay arrive le 30 juil.",
      airbnbText,
    );
    const env = {
      FORWARD_TO: "aubergeduvieuxpont2@hotmail.com",
      INTERNAL_OTA_SECRET: OTA_SECRET,
      API: { fetch: vi.fn(async () => { throw new Error("binding down"); }) },
    } as any;
    await expect(handleEmail(message, env)).resolves.toBeUndefined();
    expect(message.forward).toHaveBeenCalled();
  });

  it("propagates a forward failure so Cloudflare retries delivery", async () => {
    const message = makeMessage("automated@airbnb.com", "x", "y");
    message.forward = vi.fn(async () => { throw new Error("not verified"); });
    const { env, calls } = makeEnv();
    await expect(handleEmail(message, env)).rejects.toThrow("not verified");
    expect(calls).toHaveLength(0);
  });
});
