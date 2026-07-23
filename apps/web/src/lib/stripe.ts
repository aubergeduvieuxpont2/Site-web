/**
 * Single seam for the Stripe browser SDK (INV-single-stripe-seam).
 *
 * All other modules that need Stripe must import from here — never directly
 * from @stripe/stripe-js. This keeps the browser SDK import to one place and
 * makes it straightforward to stub in tests without a real network load.
 *
 * The publishable key is the ONLY Stripe credential that belongs in the
 * frontend bundle (INV-publishable-key-only). It is read from the Vite
 * build-time env var VITE_STRIPE_PUBLISHABLE_KEY.
 */

import type { Stripe } from "@stripe/stripe-js";

export const STRIPE_PUBLISHABLE_KEY: string | undefined =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Lazily load the Stripe.js browser SDK and return the Stripe instance.
 * Returns null when no publishable key is configured (missing-configuration
 * state). The promise is memoised so the SDK script is only fetched once per
 * page lifecycle (INV-no-dangling-iframe: the instance is shared, not recreated).
 */
export async function getStripe(): Promise<Stripe | null> {
  if (!STRIPE_PUBLISHABLE_KEY) return null;

  if (!stripePromise) {
    const { loadStripe } = await import("@stripe/stripe-js");
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
  }

  return stripePromise;
}
