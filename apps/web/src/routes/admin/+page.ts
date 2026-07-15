// Admin dashboard is client-rendered: it gates on the authenticated user's role
// at runtime (getMe) and issues admin API calls that require the session cookie.
// There is nothing to prerender or server-render.
export const ssr = false;
