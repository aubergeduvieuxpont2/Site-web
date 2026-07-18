import { sha256hex, generateToken } from "./auth/session";
import { enqueueEmail } from "./emailOutbox";

export async function provisionOtaGuest(
  sql: (...args: any[]) => Promise<any[]>,
  input: {
    guestEmail: string;
    firstName: string;
    confirmationCode: string;
    checkIn: string;
    checkOut: string;
  }
): Promise<{ userId: number | null; tokenHash: string | null }> {
  try {
    const { guestEmail, firstName, confirmationCode, checkIn, checkOut } = input;

    // Find or create user for the guest
    const existing = await sql`SELECT id FROM users WHERE lower(email) = lower(${guestEmail})`;
    let userId: number;

    if (existing.length > 0) {
      userId = existing[0].id;
    } else {
      const created = await sql`
        INSERT INTO users (email, name, role)
        VALUES (${guestEmail}, ${firstName}, 'guest')
        RETURNING id
      `;
      userId = created[0].id;
    }

    // Update the reservation to link it to the user
    await sql`
      UPDATE reservations
      SET user_id = ${userId}
      WHERE lower(email) = lower(${guestEmail})
        AND confirm_code = ${confirmationCode}
    `;

    // Mint a 30-day password reset token
    const rawToken = generateToken(32);
    const tokenHash = sha256hex(rawToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${userId}, ${tokenHash}, ${expiresAt})
    `;

    // Enqueue the welcome email
    const setPasswordUrl = `https://www.aubergeduvieuxpont.ca/reinitialisation?token=${rawToken}&welcome=1`;

    await enqueueEmail(sql, {
      template: "ota-welcome",
      to: guestEmail,
      locale: "en",
      payload: {
        firstName,
        confirmationCode,
        checkIn,
        checkOut,
        setPasswordUrl,
      },
    });

    return { userId, tokenHash };
  } catch (err) {
    // Never throw; provisioning failure must not surface to the booking path
    console.error("OTA guest provisioning error:", err);
    return { userId: null, tokenHash: null };
  }
}
