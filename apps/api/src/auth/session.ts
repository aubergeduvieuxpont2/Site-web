export type User = {
  id: number;
  email: string;
  name: string | null;
  role: "guest" | "admin";
};

export async function createSession(
  sql: any,
  userId: number,
  ttlDays: number = 30
): Promise<string> {
  const token = generateToken();
  const tokenHash = await sha256hex(token);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  await sql`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${tokenHash}, ${userId}, ${expiresAt})
  `;

  return token;
}

export async function validateSession(sql: any, token: string): Promise<User | null> {
  const tokenHash = await sha256hex(token);

  const rows = (await sql`
    SELECT u.id, u.email, u.name, u.role
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > now()
  `) as User[];

  return rows[0] || null;
}

export async function deleteSession(sql: any, token: string): Promise<void> {
  const tokenHash = await sha256hex(token);
  await sql`
    DELETE FROM sessions
    WHERE token_hash = ${tokenHash}
  `;
}

export function getSessionCookieHeader(token: string, maxAge?: number): string {
  const parts = [
    `session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
  ];

  if (maxAge !== undefined) {
    parts.push(`Max-Age=${maxAge}`);
  }

  return parts.join("; ");
}

export function getClearSessionCookieHeader(): string {
  return "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0";
}

export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function invalidateUserSessions(sql: any, userId: number): Promise<void> {
  await sql`DELETE FROM sessions WHERE user_id = ${userId}`;
}
