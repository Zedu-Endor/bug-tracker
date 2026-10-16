/**
 * Deploy sub-path. Defaults to "/bug-tracker" (https://contributors.zedu.chat/bug-tracker).
 * Set NEXT_PUBLIC_BASE_PATH at build time to override it; use "/" to serve from the
 * domain root (e.g. https://issues.zedu.chat).
 */
function resolveBasePath(raw: string | undefined): string {
  if (raw === undefined) return "/bug-tracker";
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export const BASE_PATH = resolveBasePath(process.env.NEXT_PUBLIC_BASE_PATH);

/**
 * Strips the deploy basePath from a request pathname.
 * Proxy/middleware can see either form (`/bug-tracker/bugs` or `/bugs`),
 * so both must resolve to the app-relative path.
 */
export function toAppPath(pathname: string): string {
  if (pathname === BASE_PATH) return "/";
  if (pathname.startsWith(`${BASE_PATH}/`)) {
    return pathname.slice(BASE_PATH.length) || "/";
  }
  return pathname;
}
