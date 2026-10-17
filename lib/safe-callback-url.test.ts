import { describe, expect, it } from "vitest";
import { safeCallbackUrl } from "./safe-callback-url";

describe("safeCallbackUrl", () => {
  it("defaults to /bugs on null or non-string", () => {
    expect(safeCallbackUrl(null)).toBe("/bugs");
    expect(safeCallbackUrl(undefined)).toBe("/bugs");
    expect(safeCallbackUrl("")).toBe("/bugs");
  });

  it("blocks external open redirects", () => {
    expect(safeCallbackUrl("https://evil.com")).toBe("/bugs");
    expect(safeCallbackUrl("//evil.com")).toBe("/bugs");
    expect(safeCallbackUrl("/\\evil.com")).toBe("/bugs");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/bugs");
    expect(safeCallbackUrl("/\\/evil.com")).toBe("/bugs");
    expect(safeCallbackUrl("/path\\with\\backslash")).toBe("/bugs");
    expect(safeCallbackUrl("/\t/evil.example")).toBe("/bugs");
    expect(safeCallbackUrl("/\n/evil.example")).toBe("/bugs");
    expect(safeCallbackUrl("/\r/evil.example")).toBe("/bugs");
    expect(safeCallbackUrl("javascript:alert(1)")).toBe("/bugs");
  });

  it("keeps app-relative paths untouched", () => {
    expect(safeCallbackUrl("/bugs")).toBe("/bugs");
    expect(safeCallbackUrl("/bugs/new")).toBe("/bugs/new");
    expect(safeCallbackUrl("/admin/users")).toBe("/admin/users");
  });

  it("strips deploy basePath prefix to prevent double-prefix redirects", () => {
    expect(safeCallbackUrl("/bug-tracker/bugs")).toBe("/bugs");
    expect(safeCallbackUrl("/bug-tracker/bugs/new")).toBe("/bugs/new");
    expect(safeCallbackUrl("/bug-tracker")).toBe("/");
  });

  it("rejects auth routes to prevent bounce loops (#352)", () => {
    expect(safeCallbackUrl("/login")).toBe("/bugs");
    expect(safeCallbackUrl("/login?callbackUrl=%2Fbugs")).toBe("/bugs");
    expect(safeCallbackUrl("/signup")).toBe("/bugs");
    expect(safeCallbackUrl("/forgot-password")).toBe("/bugs");
    expect(safeCallbackUrl("/reset-password")).toBe("/bugs");
    expect(safeCallbackUrl("/reset-password?token=xyz")).toBe("/bugs");
    expect(safeCallbackUrl("/session-expired")).toBe("/bugs");
    expect(safeCallbackUrl("/api/auth/signout")).toBe("/bugs");
    expect(safeCallbackUrl("/api/auth/callback/google")).toBe("/bugs");
    expect(safeCallbackUrl("/bug-tracker/login")).toBe("/bugs");
    expect(safeCallbackUrl("/login#section")).toBe("/bugs");
    expect(safeCallbackUrl("/bugs/../login")).toBe("/bugs");
    expect(safeCallbackUrl("/bugs#section")).toBe("/bugs#section");
  });
});
