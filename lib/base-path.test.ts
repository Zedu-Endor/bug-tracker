import { describe, expect, it, vi } from "vitest";
import { BASE_PATH, toAppPath } from "./base-path";

describe("toAppPath", () => {
  it("strips the basePath prefix", () => {
    expect(toAppPath("/bug-tracker/bugs")).toBe("/bugs");
    expect(toAppPath("/bug-tracker/bugs/42")).toBe("/bugs/42");
    expect(toAppPath("/bug-tracker/api/auth/session")).toBe(
      "/api/auth/session",
    );
  });

  it("maps the bare basePath to the app root", () => {
    expect(toAppPath("/bug-tracker")).toBe("/");
    expect(toAppPath("/bug-tracker/")).toBe("/");
  });

  it("leaves app-relative paths untouched", () => {
    expect(toAppPath("/login")).toBe("/login");
    expect(toAppPath("/bugs")).toBe("/bugs");
  });

  it("does not strip lookalike prefixes", () => {
    expect(toAppPath("/bug-tracker-admin/bugs")).toBe("/bug-tracker-admin/bugs");
  });

  it("keeps BASE_PATH in sync with next.config", () => {
    expect(BASE_PATH).toBe("/bug-tracker");
  });

  it("serves from the domain root when NEXT_PUBLIC_BASE_PATH is '/'", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "/");
    const mod = await import("./base-path");
    expect(mod.BASE_PATH).toBe("");
    expect(mod.toAppPath("/bugs/42")).toBe("/bugs/42");
    expect(mod.toAppPath("/")).toBe("/");
    vi.unstubAllEnvs();
  });

  it("honours a custom sub-path", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_BASE_PATH", "issues/");
    const mod = await import("./base-path");
    expect(mod.BASE_PATH).toBe("/issues");
    vi.unstubAllEnvs();
  });
});
