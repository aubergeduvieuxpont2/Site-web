import { browser } from "$app/environment";
import { getMe, isError } from "$lib/api";
import type { LayoutLoad } from "./$types";

// The root layout is not prerendered; individual pages opt back in with
// `export const prerender = true` (e.g. the SSG marketing pages and redirects).
export const prerender = false;

/**
 * Load the authenticated user once for the whole shell.
 *
 * `getMe()` is a same-origin `/api/*` call that relies on the HttpOnly session
 * cookie, so it only runs in the browser — during SSR/prerender there is no
 * session to read and we render logged-out. The result is exposed as
 * `data.user` to the layout and every child route (profil, admin, …), which is
 * the single place the user is fetched.
 */
export const load: LayoutLoad = async () => {
  if (!browser) return { user: null };

  const result = await getMe();
  return { user: isError(result) ? null : result.user };
};
