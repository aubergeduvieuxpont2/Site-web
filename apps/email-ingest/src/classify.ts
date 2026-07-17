export type Classification =
  | { kind: "booking"; provider: "airbnb" | "expedia" }
  | { kind: "ignored"; provider: "airbnb" | "expedia"; reason: string }
  | { kind: "unknown" };

// Anchored on the end of the address so lookalike domains
// (airbnb.com.evil.io) and local-part tricks don't match.
const AIRBNB_SENDER = /@(?:[a-z0-9-]+\.)*airbnb\.(?:com|ca)$/;
const EXPEDIA_SENDER = /@(?:[a-z0-9-]+\.)*(?:expedia|expediagroup|expediamail|expediapartnercentral)\.com$/;

export function classify(fromAddress: string, subject: string): Classification {
  const addr = fromAddress.trim().toLowerCase();
  const subj = subject.normalize("NFC");

  if (AIRBNB_SENDER.test(addr)) {
    if (/réservation confirmée/i.test(subj)) return { kind: "booking", provider: "airbnb" };
    return { kind: "ignored", provider: "airbnb", reason: subj.trim() || "non-booking airbnb email" };
  }
  if (EXPEDIA_SENDER.test(addr)) {
    if (/new booking/i.test(subj)) return { kind: "booking", provider: "expedia" };
    return { kind: "ignored", provider: "expedia", reason: subj.trim() || "non-booking expedia email" };
  }
  return { kind: "unknown" };
}
