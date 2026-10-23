import { describe, expect, it } from "vitest";
import { SIDEBAR_COOKIE, parseSidebarCollapsed, sidebarCookie } from "./sidebar";

describe("sidebar collapse cookie", () => {
  it("reads only the collapsed value as collapsed", () => {
    expect(parseSidebarCollapsed("collapsed")).toBe(true);
    expect(parseSidebarCollapsed("expanded")).toBe(false);
    expect(parseSidebarCollapsed(undefined)).toBe(false);
    expect(parseSidebarCollapsed("anything")).toBe(false);
  });

  it("writes a site-wide cookie that round-trips", () => {
    const collapsed = sidebarCookie(true);
    expect(collapsed.startsWith(`${SIDEBAR_COOKIE}=collapsed;`)).toBe(true);
    expect(collapsed).toContain("path=/");
    const value = sidebarCookie(false).split(";")[0].split("=")[1];
    expect(parseSidebarCollapsed(value)).toBe(false);
  });
});
