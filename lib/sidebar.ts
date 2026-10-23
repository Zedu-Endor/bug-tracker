/**
 * The app sidebar's collapsed state. Kept in a cookie (not localStorage) so
 * the server renders the right width on the first paint, with no jump.
 */
export const SIDEBAR_COOKIE = "ziki_sidebar";
export const SIDEBAR_COLLAPSED = "collapsed";

export function parseSidebarCollapsed(value: string | undefined | null): boolean {
  return value === SIDEBAR_COLLAPSED;
}

/** The cookie string the collapse button writes, good for a year. */
export function sidebarCookie(collapsed: boolean): string {
  return `${SIDEBAR_COOKIE}=${collapsed ? SIDEBAR_COLLAPSED : "expanded"}; path=/; max-age=31536000; samesite=lax`;
}
