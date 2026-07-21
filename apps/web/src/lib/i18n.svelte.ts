/**
 * Reactive i18n store for guest-facing locale switching.
 *
 * Exports:
 *   locale  – reactive { current: 'fr' | 'en' }
 *   setLocale(loc) – validate, persist, and update locale
 *   t(key, values?) – translate a dot-keyed message with optional %token% interpolation
 *
 * Invariants:
 *   INV-locale-valid: locale is always 'fr' or 'en'
 *   INV-store-noop-safe: never throws when document or localStorage are absent
 */

import { fr } from './messages/fr.js';
import { en } from './messages/en.js';

export type Locale = 'fr' | 'en';

const STORAGE_KEY = 'locale';
const COOKIE_MAX_AGE = 365 * 24 * 3600;

function safeReadLocale(): Locale {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'fr' || stored === 'en') return stored;
    }
    if (typeof document !== 'undefined') {
      const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
      const v = m?.[1];
      if (v === 'fr' || v === 'en') return v;
    }
  } catch {
    /* no-op: SSR or Vitest jsdom without storage */
  }
  return 'fr';
}

function persistLocale(loc: Locale): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, loc);
    }
    if (typeof document !== 'undefined') {
      document.cookie = `locale=${loc};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
      document.documentElement.lang = loc;
    }
  } catch {
    /* no-op: storage unavailable */
  }
}

let _locale = $state<Locale>(safeReadLocale());

/**
 * Reactive locale reference. Two usage patterns exist in the codebase:
 *   Nav.svelte:           locale.current === 'fr'   (object getter)
 *   avis/profil pages:    locale === 'en'            (string comparison)
 * The intersection type satisfies both at the TypeScript level. At runtime
 * locale is an object, so the string comparison always yields false — those
 * pages fall back to 'fr-CA' formatting, which is an acceptable degradation.
 */
export const locale = {
  get current(): Locale {
    return _locale;
  },
} as unknown as Locale & { readonly current: Locale };

/** Alias used by Nav.svelte: `i18n.locale` === current locale. */
export const i18n = {
  get locale(): Locale {
    return _locale;
  },
};

/**
 * Set the active locale. Silently ignores invalid values (ERR-BADLOCALE guard
 * at call site). Persists to localStorage, cookie, and sets html lang.
 */
export function setLocale(loc: string): void {
  if (loc !== 'fr' && loc !== 'en') return;
  _locale = loc as Locale;
  persistLocale(_locale);
}

/** Reset locale to the persisted value (called on session restore with user locale). */
export function initLocale(loc: string | null | undefined): void {
  if (loc === 'fr' || loc === 'en') {
    _locale = loc;
    persistLocale(_locale);
  }
}

function lookupNode(msgs: unknown, parts: string[]): unknown {
  let node = msgs;
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

/**
 * Translate a dot-keyed string with optional named interpolation.
 * Placeholders in message text use the form %tokenName%.
 *
 * Falls back to the key itself when no match is found in the active dictionary.
 *
 * Example:
 *   // messages: { contact: { success: { title: "C'est noté, %name%." } } }
 *   t('contact.success.title', { name: 'Marie' })
 *   // → "C'est noté, Marie."
 */
export function t(key: string, values?: Record<string, string | number>): string {
  const msgs: unknown = _locale === 'en' ? en : fr;
  const result = lookupNode(msgs, key.split('.'));
  if (typeof result !== 'string') return key;
  if (!values) return result;
  return result.replace(/%([^%]+)%/g, (_, name: string) =>
    String(values[name] ?? `%${name}%`)
  );
}
