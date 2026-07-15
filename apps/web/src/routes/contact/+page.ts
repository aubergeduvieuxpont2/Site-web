// Contact page is server-rendered on first load (SSR default) and never
// prerendered: the reservation form POSTs to `/api/reservations` at runtime and
// renders its success/error state client-side without a reload. The layout
// already exposes `data.user` for the shell, so no load function is needed.
export const ssr = true;
export const prerender = false;
