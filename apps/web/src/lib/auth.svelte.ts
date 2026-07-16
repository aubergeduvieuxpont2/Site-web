import { getMe, isError, type User } from "./api";

/**
 * Shared reactive auth store — mirrors the `settings.svelte.ts` pattern.
 *
 * Holds only the non-sensitive user object returned by `GET /api/auth/me`
 * ({ id, email, name, role }). No tokens or passwords are ever stored here;
 * all auth is cookie-based and handled by the API. Never persisted to
 * localStorage — cleared on logout or a failed auth check.
 */
export const auth = $state<{
  user: User | null;
  loaded: boolean;
}>({
  user: null,
  loaded: false,
});

/** Set the authenticated user and mark the initial auth check complete. */
export function setUser(user: User | null): void {
  auth.user = user;
  auth.loaded = true;
}

/** Clear the user (logout or failed auth check); leaves `loaded = true`. */
export function clearUser(): void {
  auth.user = null;
  auth.loaded = true;
}

/**
 * Fetch the current session via `getMe()`. On success sets the user; on API
 * error or exception clears it. Never throws and always leaves `loaded = true`.
 * Safe to call multiple times — each call re-fetches the current session.
 */
export async function loadAuth(): Promise<void> {
  try {
    const result = await getMe();
    if (!isError(result)) {
      setUser(result.user);
    } else {
      clearUser();
    }
  } catch {
    clearUser();
  }
}
