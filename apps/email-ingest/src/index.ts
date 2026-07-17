import PostalMime from "postal-mime";
import { classify } from "./classify";
import { htmlToText } from "./htmlToText";
import { parseAirbnb } from "./parsers/airbnb";
import { parseExpedia } from "./parsers/expedia";
import type { Env } from "./types";

/**
 * Ordering is deliberate and load-bearing:
 *  1. forward() FIRST — the operator's mailbox copy must never depend on
 *     parsing. If forward() itself fails we let the error propagate so
 *     Cloudflare retries/bounces the delivery.
 *  2. After a successful forward, never throw: a retried delivery would
 *     forward a duplicate. Parse/API problems are logged (worker logs +
 *     email_ingest_log via the API when reachable) instead.
 */
export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  await message.forward(env.FORWARD_TO);

  try {
    const parsed = await PostalMime.parse(message.raw);
    const from = parsed.from?.address ?? message.from;
    const subject = (parsed.subject ?? "").normalize("NFC");

    const cls = classify(from, subject);
    if (cls.kind === "unknown") return;

    let body: Record<string, unknown>;
    if (cls.kind === "ignored") {
      body = { status: "ignored", provider: cls.provider, subject, error: cls.reason };
    } else {
      const text = parsed.text?.trim() ? parsed.text : htmlToText(parsed.html ?? "");
      const sentAt = parsed.date ? new Date(parsed.date) : new Date();
      const booking =
        cls.provider === "airbnb" ? parseAirbnb(text, subject, sentAt) : parseExpedia(text, subject);
      body = booking
        ? { ...booking, status: "parsed", subject }
        : { status: "parse_failed", provider: cls.provider, subject, error: "parser returned null" };
    }

    const res = await env.API.fetch("http://api/internal/ota-bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("email-ingest: API rejected ingest", res.status, await res.text());
    }
  } catch (err) {
    console.error("email-ingest: processing failed (email was forwarded)", err);
  }
}

export default {
  email: (message, env) => handleEmail(message, env),
} satisfies ExportedHandler<Env>;
