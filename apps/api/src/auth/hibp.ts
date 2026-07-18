// Have I Been Pwned "range" (k-anonymity) breached-password check.
//
// We SHA-1 the candidate password, send only the first 5 hex chars to the HIBP
// API, and compare the returned suffixes locally — the full hash never leaves
// the Worker. The check FAILS OPEN: any network error, timeout, or non-200
// response resolves to `false` (not breached) so a HIBP outage can never block
// a legitimate registration / password change.

async function sha1hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-1", encoded);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isPasswordBreached(password: string): Promise<boolean> {
  try {
    const hash = (await sha1hex(password)).toUpperCase();
    const prefix = hash.slice(0, 5);
    const suffix = hash.slice(5);

    // 3s ceiling so a slow HIBP endpoint can't stall the request.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    let res: Response;
    try {
      res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { "Add-Padding": "true" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) return false; // fail open
    const text = await res.text();
    for (const line of text.split("\n")) {
      const hashSuffix = line.split(":")[0]?.trim().toUpperCase();
      if (hashSuffix === suffix) return true;
    }
    return false;
  } catch {
    return false; // fail open on any error/timeout
  }
}
