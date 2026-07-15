// The profil page is client-rendered: it gates on the authenticated user at
// runtime (getMe → redirect to /connexion on 401) and fetches session-scoped
// profile data that must never be prerendered or server-rendered.
export const ssr = false;
export const prerender = false;
