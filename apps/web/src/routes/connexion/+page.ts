// Connexion page is server-rendered on first load (SSR default). It is never
// prerendered: the two forms POST credentials to `/api/auth/*` at runtime and
// redirect to `/profil` client-side on success. No load function is needed —
// the layout already exposes `data.user` for the shell.
export const ssr = true;
