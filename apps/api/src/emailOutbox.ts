import { neon } from "@neondatabase/serverless";
import { renderEmail } from "./emails/render";
import { contactContext } from "./emails/routes";

export const EMAIL_FROM = "Auberge du Vieux Pont <no-reply@aubergeduvieuxpont.ca>";

// The outbox carries these four toggle-gated transactional templates plus two
// security-critical templates (email-verification, email-change-alert). The
// remaining TemplateKey values (welcome, reservation-cancellation,
// invoice-receipt, review-request) are preview-only and never enqueued.
export type EmailTemplate =
  | "reservation-confirmation"
  | "password-reset"
  | "room-assigned"
  | "ota-welcome"
  | "email-verification"
  | "email-change-alert";

// Only the four notification templates are gated by an opt-in settings toggle.
// The two security templates below are intentionally absent — they are always
// sent (see ALWAYS_SEND).
export const EMAIL_TOGGLE_KEYS: Partial<Record<EmailTemplate, string>> = {
  "reservation-confirmation": "email_confirmation_enabled",
  "password-reset": "email_password_reset_enabled",
  "room-assigned": "email_room_assignment_enabled",
  "ota-welcome": "email_welcome_enabled",
};

// Security-required emails that MUST bypass the opt-in notification toggle:
// confirming ownership of an email address is not a marketing notification, so
// the operator's notification switches never suppress them.
export const ALWAYS_SEND: ReadonlySet<EmailTemplate> = new Set<EmailTemplate>([
  "email-verification",
  "email-change-alert",
]);

export function computeEmailBackoff(attempts: number): number {
  return Math.min(3600, 30 * Math.pow(2, attempts - 1));
}

// After this many attempts a row stops retrying and is marked 'failed' for
// good — otherwise a permanently-broken recipient/template retries forever.
export const MAX_ATTEMPTS = 8;

export function isTransientResendFailure(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

export async function enqueueEmail(
  sql: (...args: any[]) => any,
  input: {
    template: EmailTemplate;
    to: string;
    locale?: "fr" | "en";
    payload: Record<string, unknown>;
  }
): Promise<{ enqueued: boolean }> {
  const { template, to, locale = "fr", payload } = input;

  // Security-critical templates always send; the other four are opt-in gated.
  if (!ALWAYS_SEND.has(template)) {
    const toggleKey = EMAIL_TOGGLE_KEYS[template];
    if (!toggleKey) return { enqueued: false };

    const rows = await sql`SELECT value FROM settings WHERE key = ${toggleKey}`;
    const enabled = rows[0]?.value === "true";
    if (!enabled) return { enqueued: false };
  }

  await sql`
    INSERT INTO email_outbox (to_email, template, locale, payload)
    VALUES (${to}, ${template}, ${locale}, ${JSON.stringify(payload)}::jsonb)
  `;

  return { enqueued: true };
}

export async function drainEmailOutbox(
  env: { DB_CONN: string; RESEND_API_KEY: string }
): Promise<{ delivered: number; retried: number; failed: number }> {
  let delivered = 0;
  let retried = 0;
  let failed = 0;

  try {
    const sql = neon(env.DB_CONN);

    // Atomic claim: increment `attempts` and lock the row in the same
    // statement so two overlapping drains can never both process it (the
    // previous SELECT-then-process shape left a window between reading and
    // updating). `attempts` on each returned row already reflects this try.
    const rows = (await sql`
      UPDATE email_outbox
      SET attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM email_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY id LIMIT 10
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, to_email, template, locale, payload, attempts
    `) as {
      id: number;
      to_email: string;
      template: string;
      locale: string;
      payload: Record<string, unknown>;
      attempts: number;
    }[];

    const contact = await contactContext(env.DB_CONN);

    for (const row of rows) {
      try {
        const rendered = renderEmail(
          row.template as EmailTemplate,
          row.locale as "fr" | "en",
          { ...row.payload, ...contact }
        );

        let res: Response;
        try {
          res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: [row.to_email],
              reply_to: contact.contactEmail,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
            }),
          });
        } catch (networkErr) {
          const msg = networkErr instanceof Error ? networkErr.message : "Network error";
          try {
            if (row.attempts >= MAX_ATTEMPTS) {
              await sql`
                UPDATE email_outbox
                SET status = 'failed',
                    last_error = ${msg},
                    updated_at = now()
                WHERE id = ${row.id}
              `;
              failed++;
            } else {
              const backoffSecs = computeEmailBackoff(row.attempts);
              await sql`
                UPDATE email_outbox
                SET next_attempt_at = now() + (${backoffSecs.toString()} || ' seconds')::interval,
                    last_error = ${msg},
                    updated_at = now()
                WHERE id = ${row.id}
              `;
              retried++;
            }
          } catch {}
          continue;
        }

        if (res.status === 200 || res.status === 201) {
          let providerId: string | null = null;
          try {
            const body = (await res.json()) as { id?: string };
            providerId = body.id ?? null;
          } catch {}
          await sql`
            UPDATE email_outbox
            SET status = 'delivered',
                provider_id = ${providerId},
                updated_at = now()
            WHERE id = ${row.id}
          `;
          delivered++;
        } else if (isTransientResendFailure(res.status)) {
          if (row.attempts >= MAX_ATTEMPTS) {
            await sql`
              UPDATE email_outbox
              SET status = 'failed',
                  last_error = ${"HTTP " + res.status + " (max attempts reached)"},
                  updated_at = now()
              WHERE id = ${row.id}
            `;
            failed++;
          } else {
            const backoffSecs = computeEmailBackoff(row.attempts);
            await sql`
              UPDATE email_outbox
              SET next_attempt_at = now() + (${backoffSecs.toString()} || ' seconds')::interval,
                  last_error = ${"HTTP " + res.status},
                  updated_at = now()
              WHERE id = ${row.id}
            `;
            retried++;
          }
        } else {
          // Permanent failure (4xx other than 429): no point retrying regardless of attempts.
          // L11: record only the status code — the Resend response body can echo
          // the recipient address/name (PII) and must never land in the log column.
          await sql`
            UPDATE email_outbox
            SET status = 'failed',
                last_error = ${"HTTP " + res.status},
                updated_at = now()
            WHERE id = ${row.id}
          `;
          failed++;
        }
      } catch (rowErr) {
        const msg = rowErr instanceof Error ? rowErr.message : "Unknown error";
        try {
          await sql`
            UPDATE email_outbox
            SET status = 'failed',
                last_error = ${msg},
                updated_at = now()
            WHERE id = ${row.id}
          `;
        } catch {}
        failed++;
      }
    }
  } catch {
    // DB connection or query failure — resolve without throwing
  }

  return { delivered, retried, failed };
}
