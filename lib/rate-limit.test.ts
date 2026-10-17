import { beforeEach, describe, expect, it } from "vitest";
import {
  checkRateLimit,
  resetRateLimits,
  RATE_LIMIT_MESSAGE,
  ACTION_RATE_LIMITS,
} from "./rate-limit";

describe("rate-limiting (#130)", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("has friendly error message", () => {
    expect(RATE_LIMIT_MESSAGE).toContain("You're doing that too fast");
  });

  it("allows actions within the limit", () => {
    const config = { max: 3, windowMs: 1000 };
    expect(checkRateLimit("user-1", config, 100).allowed).toBe(true);
    expect(checkRateLimit("user-1", config, 200).allowed).toBe(true);
    expect(checkRateLimit("user-1", config, 300).allowed).toBe(true);
  });

  it("blocks actions exceeding the limit in the window", () => {
    const config = { max: 2, windowMs: 1000 };
    expect(checkRateLimit("user-1", config, 100).allowed).toBe(true);
    expect(checkRateLimit("user-1", config, 200).allowed).toBe(true);

    const blocked = checkRateLimit("user-1", config, 300);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window expires", () => {
    const config = { max: 2, windowMs: 1000 };
    expect(checkRateLimit("user-1", config, 100).allowed).toBe(true);
    expect(checkRateLimit("user-1", config, 200).allowed).toBe(true);
    expect(checkRateLimit("user-1", config, 300).allowed).toBe(false);

    // After 1000ms window from first request
    expect(checkRateLimit("user-1", config, 1200).allowed).toBe(true);
  });

  it("tracks rate limits separately for different users", () => {
    const config = { max: 1, windowMs: 1000 };
    expect(checkRateLimit("user-1", config, 100).allowed).toBe(true);
    expect(checkRateLimit("user-1", config, 200).allowed).toBe(false);
    expect(checkRateLimit("user-2", config, 200).allowed).toBe(true);
  });
});

describe("auth rate limits (#207)", () => {
  beforeEach(() => resetRateLimits());

  it("limits per email across different IPs", async () => {
    const { checkAuthRateLimit, AUTH_RATE_LIMITS } = await import("./rate-limit");
    const max = AUTH_RATE_LIMITS.forgotPassword.email.max;
    for (let i = 0; i < max; i++) {
      expect(checkAuthRateLimit("forgotPassword", { email: "Bob@x.dev", ip: `10.0.0.${i}` }, 1000).allowed).toBe(true);
    }
    // Same address, new IP, different casing: still blocked.
    expect(checkAuthRateLimit("forgotPassword", { email: "bob@x.dev ", ip: "10.0.0.99" }, 1000).allowed).toBe(false);
  });

  it("limits per IP across different emails", async () => {
    const { checkAuthRateLimit, AUTH_RATE_LIMITS } = await import("./rate-limit");
    const max = AUTH_RATE_LIMITS.signup.ip.max;
    for (let i = 0; i < max; i++) {
      expect(checkAuthRateLimit("signup", { email: `u${i}@x.dev`, ip: "1.2.3.4" }, 1000).allowed).toBe(true);
    }
    const blocked = checkAuthRateLimit("signup", { email: "fresh@x.dev", ip: "1.2.3.4" }, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("frees up again once the window has passed", async () => {
    const { checkAuthRateLimit, AUTH_RATE_LIMITS } = await import("./rate-limit");
    const { max, windowMs } = AUTH_RATE_LIMITS.login.email;
    for (let i = 0; i < max; i++) checkAuthRateLimit("login", { email: "a@x.dev" }, 0);
    expect(checkAuthRateLimit("login", { email: "a@x.dev" }, 1).allowed).toBe(false);
    expect(checkAuthRateLimit("login", { email: "a@x.dev" }, windowMs + 1).allowed).toBe(true);
  });

  it("reads the client IP from proxy headers and ignores junk", async () => {
    const { clientIpFrom } = await import("./rate-limit");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientIpFrom(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "<script>" }))).toBeNull();
    expect(clientIpFrom(new Headers())).toBeNull();
  });

  it("drops expired keys once it tracks many, so memory stays bounded", async () => {
    const { checkRateLimit, trackedKeyCount } = await import("./rate-limit");
    for (let i = 0; i < 10_001; i++) checkRateLimit(`k${i}`, { max: 5, windowMs: 1000 }, 0);
    checkRateLimit("fresh", { max: 5, windowMs: 1000 }, 2 * 60 * 60 * 1000);
    expect(trackedKeyCount()).toBe(1);
  });
});

describe("action rate limits (#350)", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("configures limits for all state-mutating actions", () => {
    expect(ACTION_RATE_LIMITS.createBug).toEqual({ max: 10, windowMs: 60 * 1000 });
    expect(ACTION_RATE_LIMITS.addComment).toEqual({ max: 20, windowMs: 60 * 1000 });
    expect(ACTION_RATE_LIMITS.toggleVote).toEqual({ max: 60, windowMs: 60 * 1000 });
    expect(ACTION_RATE_LIMITS.editBug).toEqual({ max: 20, windowMs: 60 * 1000 });
    expect(ACTION_RATE_LIMITS.editComment).toEqual({ max: 30, windowMs: 60 * 1000 });
    expect(ACTION_RATE_LIMITS.selfAssign).toEqual({ max: 15, windowMs: 60 * 1000 });
  });

  it("enforces editComment rate limit", () => {
    const key = "edit-comment:user-1";
    for (let i = 0; i < ACTION_RATE_LIMITS.editComment.max; i++) {
      expect(checkRateLimit(key, ACTION_RATE_LIMITS.editComment, 1000 + i).allowed).toBe(true);
    }
    expect(checkRateLimit(key, ACTION_RATE_LIMITS.editComment, 1100).allowed).toBe(false);
  });

  it("enforces editBug rate limit", () => {
    const key = "edit-bug:user-1";
    for (let i = 0; i < ACTION_RATE_LIMITS.editBug.max; i++) {
      expect(checkRateLimit(key, ACTION_RATE_LIMITS.editBug, 1000 + i).allowed).toBe(true);
    }
    expect(checkRateLimit(key, ACTION_RATE_LIMITS.editBug, 1100).allowed).toBe(false);
  });

  it("enforces selfAssign rate limit", () => {
    const key = "self-assign:user-1";
    for (let i = 0; i < ACTION_RATE_LIMITS.selfAssign.max; i++) {
      expect(checkRateLimit(key, ACTION_RATE_LIMITS.selfAssign, 1000 + i).allowed).toBe(true);
    }
    expect(checkRateLimit(key, ACTION_RATE_LIMITS.selfAssign, 1100).allowed).toBe(false);
  });
});

