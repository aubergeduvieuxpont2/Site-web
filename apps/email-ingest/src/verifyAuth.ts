/**
 * Domain-aligned DKIM/SPF verification for inbound OTA mail.
 *
 * A reservation is created only when the message carries an
 * `Authentication-Results` header with a *pass* result whose domain is aligned
 * to (equal to, or a subdomain of) an allowed provider domain. DKIM is
 * preferred over SPF: SPF aligns to the envelope sender, which forwarding can
 * break, whereas the DKIM signature domain (`header.d`) is stable. A missing,
 * failing, or unaligned result yields `false` — the caller still forwards the
 * mail, but never trusts it enough to create a booking.
 */

export const AIRBNB_DOMAINS = ["airbnb.com", "airbnb.ca"];
export const EXPEDIA_DOMAINS = [
  "expedia.com",
  "expediagroup.com",
  "expediamail.com",
  "expediapartnercentral.com",
];

type AuthMethod = { method: "dkim" | "spf"; result: string; domain: string | null };

function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, "").replace(/\.$/, "");
}

// A domain is aligned when it equals an allowed domain or is a subdomain of one.
function isAligned(domain: string | null, allowed: string[]): boolean {
  if (!domain) return false;
  const d = normalizeDomain(domain);
  if (!d) return false;
  return allowed.some((a) => {
    const al = a.toLowerCase();
    return d === al || d.endsWith(`.${al}`);
  });
}

function domainOfMailbox(value: string): string | null {
  const v = value.trim().replace(/[<>]/g, "");
  const at = v.lastIndexOf("@");
  const domain = at >= 0 ? v.slice(at + 1) : v;
  return domain ? normalizeDomain(domain) : null;
}

function extractDomain(segment: string, method: "dkim" | "spf"): string | null {
  if (method === "dkim") {
    const d = segment.match(/header\.d=([^\s;]+)/i);
    if (d) return normalizeDomain(d[1]);
    const i = segment.match(/header\.i=([^\s;]+)/i);
    if (i) return domainOfMailbox(i[1]);
    return null;
  }
  // spf
  const mailfrom = segment.match(/smtp\.mailfrom=([^\s;]+)/i);
  if (mailfrom) return domainOfMailbox(mailfrom[1]);
  const helo = segment.match(/smtp\.helo=([^\s;]+)/i);
  if (helo) return normalizeDomain(helo[1]);
  return null;
}

function parseAuthResults(raw: string): AuthMethod[] {
  const methods: AuthMethod[] = [];
  // Multiple Authentication-Results headers may be concatenated; split on
  // newlines and on ';' so each method=result clause is examined on its own.
  for (const line of raw.split(/\r?\n/)) {
    for (const segment of line.split(";")) {
      const m = segment.match(
        /\b(dkim|spf)\s*=\s*(pass|fail|none|neutral|softfail|hardfail|temperror|permerror)\b/i,
      );
      if (!m) continue;
      const method = m[1].toLowerCase() as "dkim" | "spf";
      const result = m[2].toLowerCase();
      methods.push({ method, result, domain: extractDomain(segment, method) });
    }
  }
  return methods;
}

export function verifyAuth(input: {
  authResults: string | null | undefined;
  allowedDomains: string[];
}): boolean {
  const raw = input.authResults;
  if (!raw || typeof raw !== "string") return false;

  const methods = parseAuthResults(raw);

  // DKIM preferred (stable signature domain).
  const dkim = methods.find((m) => m.method === "dkim" && m.result === "pass");
  if (dkim && isAligned(dkim.domain, input.allowedDomains)) return true;

  // SPF accepted as a fallback.
  const spf = methods.find((m) => m.method === "spf" && m.result === "pass");
  if (spf && isAligned(spf.domain, input.allowedDomains)) return true;

  return false;
}
