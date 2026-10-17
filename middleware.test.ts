import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  default: () => ({
    auth: (fn: (req: unknown) => unknown) => fn,
  }),
}));

import middleware, { isPublicPath } from "./middleware";

type MockRequest = {
  nextUrl: URL;
  auth: { user: { id: string; email: string } } | null;
  headers: Headers;
};

function createMockReq({
  pathname,
  isLoggedIn = false,
  userAgent = "Mozilla/5.0",
}: {
  pathname: string;
  isLoggedIn?: boolean;
  userAgent?: string;
}): MockRequest {
  const url = new URL(`https://issues.zedu.chat${pathname}`);
  return {
    nextUrl: url,
    auth: isLoggedIn ? { user: { id: "u1", email: "user@test.com" } } : null,
    headers: new Headers({
      "user-agent": userAgent,
    }),
  };
}

const runMiddleware = (req: MockRequest): Response => {
  return (middleware as unknown as (r: unknown) => Response)(req);
};

describe("isPublicPath (#348)", () => {
  it("treats /session-expired as public", () => {
    expect(isPublicPath("/session-expired")).toBe(true);
    expect(isPublicPath("/session-expired/")).toBe(true);
  });

  it("treats auth and password reset pages as public", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/signup")).toBe(true);
    expect(isPublicPath("/forgot-password")).toBe(true);
    expect(isPublicPath("/reset-password")).toBe(true);
  });

  it("treats api endpoints and assets as public", () => {
    expect(isPublicPath("/api/auth/session")).toBe(true);
    expect(isPublicPath("/api/health")).toBe(true);
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });

  it("treats application routes as non-public", () => {
    expect(isPublicPath("/bugs")).toBe(false);
    expect(isPublicPath("/bugs/new")).toBe(false);
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/admin/users")).toBe(false);
  });
});

describe("middleware routing (#348)", () => {
  it("allows unauthenticated requests to /session-expired without redirecting to /login", () => {
    const req = createMockReq({ pathname: "/session-expired", isLoggedIn: false });
    const res = runMiddleware(req);

    // Should not redirect to login
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("redirects unauthenticated requests to protected pages to /login with callbackUrl", () => {
    const req = createMockReq({ pathname: "/bugs", isLoggedIn: false });
    const res = runMiddleware(req);

    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toContain("/login");
    expect(location).toContain("callbackUrl=%2Fbugs");
  });

  it("redirects logged-in users visiting /login to /bugs", () => {
    const req = createMockReq({ pathname: "/login", isLoggedIn: true });
    const res = runMiddleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://issues.zedu.chat/bugs");
  });

  it("allows logged-in users to proceed to protected pages", () => {
    const req = createMockReq({ pathname: "/bugs", isLoggedIn: true });
    const res = runMiddleware(req);

    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });
});
