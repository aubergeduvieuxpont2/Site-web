import { hashPassword } from "./auth/password";
import { generateToken, sha256hex } from "./auth/session";
import { enqueueEmail } from "./emailOutbox";

export const SITE_ORIGIN = "https://www.aubergeduvieuxpont.ca";

type NeonSql = (strings: TemplateStringsArray, ...vals: unknown[]) => Promise<unknown>;

/**
 * Find-or-create a portal account for an OTA guest, link the reservation,
 * and (toggle permitting) send the set-password welcome email. Best-effort:
 * the booking must never fail because provisioning did, so every error is
 * swallowed after logging.
 */
export async function provisionOtaGuest(
  sql: NeonSql,
  input: {
    reservationId: number;
    guestEmail: string;
    firstName: string;
    lastName: string | null;
    externalRef: string;
    checkIn: string;
    checkOut: string;
  },
): Promise<void> {
  try {
    const existing = (await sql`
      SELECT id FROM users WHERE lower(email) = lower(${input.guestEmail})
    `) as { id: number }[];

    let userId = existing[0]?.id;
    if (!userId) {
      const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
      // Unusable random password: the guest sets their real one via the link.
      const passwordHash = await hashPassword(generateToken());
      const created = (await sql`
        INSERT INTO users (email, password_hash, name, role, first_name, last_name)
        VALUES (${input.guestEmail}, ${passwordHash}, ${name}, 'guest', ${input.firstName}, ${input.lastName})
        ON CONFLICT DO NOTHING
        RETURNING id
      `) as { id: number }[];
      userId = created[0]?.id;
      if (!userId) return; // raced with another insert; next email re-links
    }

    await sql`UPDATE reservations SET user_id = ${userId} WHERE id = ${input.reservationId}`;

    const rawToken = generateToken();
    const tokenHash = await sha256hex(rawToken);
    await sql`
      INSERT INTO password_reset_tokens (token_hash, user_id, expires_at)
      VALUES (${tokenHash}, ${userId}, now() + interval '30 days')
    `;

    await enqueueEmail(sql as never, {
      template: "ota-welcome",
      to: input.guestEmail,
      payload: {
        firstName: input.firstName,
        confirmationCode: input.externalRef,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        setPasswordUrl: `${SITE_ORIGIN}/reinitialisation?token=${rawToken}&welcome=1`,
      },
    });
  } catch (err) {
    console.error("ota provisioning failed (reservation kept)", err);
  }
}
