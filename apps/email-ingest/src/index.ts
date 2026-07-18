import PostalMime from "postal-mime";
import { classify } from "./classify";
import { htmlToText } from "./htmlToText";
import { parseAirbnb } from "./parsers/airbnb";
import { parseExpedia } from "./parsers/expedia";
import { verifyAuth, AIRBNB_DOMAINS, EXPEDIA_DOMAINS } from "./verifyAuth";
import type { Env } from "./types";

// Collect every Authentication-Results header value from the parsed message.
// postal-mime lowercases header keys. Returns null when none are present.
function readAuthResults(
  headers: { key: string; value: string }[] | undefined,
): string | null {
  if (!headers) return null;
  const values = headers
    .filter((h) => h.key.toLowerCase() === "authentication-results")
    .map((h) => h.value);
  return values.length ? values.join("\n") : null;
}

function postInternal(env: Env, body: Record<string, unknown>): Promise<Response> {
  return env.API.fetch("http://api/internal/ota-bookings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // Authenticate to the API's service-binding-only internal endpoint.
      "X-Internal-Auth": env.INTERNAL_OTA_SECRET ?? "",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Ordering is deliberate and load-bearing:
 *  1. Classify BEFORE forwarding: only recognized OTA senders are forwarded
 *     to the backup mailbox (spam is rejected at SMTP time). If MIME parsing
 *     itself fails, fall back to classifying the envelope sender so OTA mail
 *     is still forwarded, never dropped.
 *  2. For forwarded (OTA) mail, forward() failures propagate so Cloudflare
 *     retries/bounces the delivery.
 *  3. Trust the content enough to create a reservation ONLY when the message's
 *     Authentication-Results header shows a DKIM/SPF pass aligned to the
 *     provider's domain. Unverified mail is still forwarded (never suppressed)
 *     but creates no reservation — the bare From header is not an auth signal.
 *  4. After a successful forward, never throw: a retried delivery would
 *     forward a duplicate. Parse/API problems are logged instead.
 */
export async function handleEmail(message: ForwardableEmailMessage, env: Env): Promise<void> {
  let parsed: Awaited<ReturnType<typeof PostalMime.parse>>;
  try {
    parsed = await PostalMime.parse(message.raw);
  } catch (err) {
    console.error("email-ingest: MIME parse failed", err);
    // Can't read headers — classify on the envelope sender alone. OTA mail
    // still reaches the backup mailbox; everything else is rejected. Without
    // headers we cannot verify DKIM/SPF, so no reservation is created.
    if (classify(message.from, "").kind !== "unknown") {
      await message.forward(env.FORWARD_TO);
    } else {
      message.setReject("Message rejected");
    }
    return;
  }

  const from = parsed.from?.address ?? message.from;
  const subject = (parsed.subject ?? "").normalize("NFC");
  const cls = classify(from, subject);

  if (cls.kind === "unknown") {
    message.setReject("Message rejected");
    return;
  }

  // Recognized OTA mail: forward to the backup mailbox first. Forwarding is
  // never suppressed, even when verification below fails.
  await message.forward(env.FORWARD_TO);

  // Domain-aligned DKIM/SPF verification gates reservation creation.
  const allowedDomains = cls.provider === "airbnb" ? AIRBNB_DOMAINS : EXPEDIA_DOMAINS;
  const authResults = readAuthResults(parsed.headers as any);
  if (!verifyAuth({ authResults, allowedDomains })) {
    console.warn(
      "email-ingest: unverified OTA mail forwarded, reservation suppressed",
      from,
      subject,
    );
    return;
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

    const res = await postInternal(env, body);
    if (!res.ok) {
      const status = res.status;
      const responseText = await res.text();
      console.error("email-ingest: API rejected ingest", status, responseText);
      // The parsed booking itself was lost (API 4xx/5xx'd it) — without this,
      // nothing lands in email_ingest_log and the admin tab never shows it.
      // Best-effort re-report as a failure; a second rejection is only logged.
      if (body.status === "parsed") {
        try {
          const retryRes = await postInternal(env, {
            status: "parse_failed",
            provider: cls.provider,
            subject,
            error: `API rejected parsed booking: ${status} ${responseText}`,
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
    console.error("email-ingest: processing failed (email was forwarded)", err);
  }
}

export default {
  email: (message, env) => handleEmail(message, env),
} satisfies ExportedHandler<Env>;
