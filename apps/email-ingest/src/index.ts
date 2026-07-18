import PostalMime from "postal-mime";
import { classify } from "./classify";
import { htmlToText } from "./htmlToText";
import { parseAirbnb } from "./parsers/airbnb";
import { parseExpedia } from "./parsers/expedia";
import type { Env } from "./types";

/**
 * Ordering is deliberate and load-bearing:
 *  1. Classify BEFORE forwarding: only recognized OTA senders are forwarded
 *     to the backup mailbox (spam is rejected at SMTP time, and the
 *     operator's own DEV_SENDER test emails are processed but not
 *     forwarded). If MIME parsing itself fails, fall back to classifying
 *     the envelope sender so OTA mail is still forwarded, never dropped.
 *  2. For forwarded (OTA) mail, forward() failures propagate so Cloudflare
 *     retries/bounces the delivery.
 *  3. After a successful forward, never throw: a retried delivery would
 *     forward a duplicate. Parse/API problems are logged (worker logs +
 *     email_ingest_log via the API when reachable) instead.
 */
export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  let parsed: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    parsed = await PostalMime.parse(message.raw);
  } catch (err) {
    console.error("email-ingest: MIME parse failed", err);
    // Can't read headers — classify on the envelope sender alone. OTA mail
    // still reaches the backup mailbox; everything else is rejected.
    if (classify(message.from, "", env.DEV_SENDER).kind !== "unknown") {
      await message.forward(env.FORWARD_TO);
    } else {
      message.setReject("Message rejected");
    }
    return;
  }

  const from = parsed.from?.address ?? message.from;
  const subject = (parsed.subject ?? "").normalize("NFC");
  const cls = classify(from, subject, env.DEV_SENDER);

  if (cls.kind === "unknown") {
    message.setReject("Message rejected");
    return;
  }

  const isDevSender =
    !!env.DEV_SENDER && from.trim().toLowerCase() === env.DEV_SENDER.trim().toLowerCase();
  if (!isDevSender) {
    await message.forward(env.FORWARD_TO);
  }

  try {
    let body: Record<string, unknown>;
    if (cls.kind === "ignored") {
      body = { status: "ignored", provider: cls.provider, subject, error: cls.reason };
    } else {
      // Cap parser input: parsers do bounded-but-unbounded-input regex work
      // (findDate/table scans etc.) over attacker-influenced email content.
      const text = (parsed.text?.trim() ? parsed.text : htmlToText(parsed.html ?? "")).slice(0, 200_000);
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
      const status = res.status;
      const responseText = await res.text();
      console.error("email-ingest: API rejected ingest", status, responseText);
      // The parsed booking itself was lost (API 4xx/5xx'd it) — without this,
      // nothing lands in email_ingest_log and the admin tab never shows it.
      // Best-effort re-report as a failure; a second rejection is only logged.
      if (body.status === "parsed") {
        try {
          const retryRes = await env.API.fetch("http://api/internal/ota-bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "parse_failed",
              provider: cls.provider,
              subject,
              error: `API rejected parsed booking: ${status} ${responseText}`,
            }),
          });
          if (!retryRes.ok) {
            console.error("email-ingest: parse_failed fallback also rejected", retryRes.status, await retryRes.text());
          }
        } catch (fallbackErr) {
          console.error("email-ingest: parse_failed fallback POST threw", fallbackErr);
        }
      }
    }
  } catch (err) {
    console.error(
      isDevSender
        ? "email-ingest: processing failed (dev-sender email, not forwarded)"
        : "email-ingest: processing failed (email was forwarded)",
      err,
    );
  }
}

export default {
  email: (message, env) => handleEmail(message, env),
} satisfies ExportedHandler<Env>;
