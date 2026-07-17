// Client-only page: the admin guard runs in `onMount` via `getMe()`, so there
// is no server-render pass (mirrors admin/+page.ts).
export const ssr = false;
