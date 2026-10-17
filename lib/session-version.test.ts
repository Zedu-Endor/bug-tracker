import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  SESSION_EXPIRED_MESSAGE,
  isSessionVersionCurrent,
  resolveSessionUserId,
} from "./session-user";

const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

describe("isSessionVersionCurrent", () => {
  it("treats sessions without a version as version 0", () => {
    expect(isSessionVersionCurrent(undefined, 0)).toBe(true);
    expect(isSessionVersionCurrent(null, 0)).toBe(true);
    expect(isSessionVersionCurrent(undefined, 1)).toBe(false);
  });

  it("requires an exact match", () => {
    expect(isSessionVersionCurrent(2, 2)).toBe(true);
    expect(isSessionVersionCurrent(1, 2)).toBe(false);
  });
});

describe("resolveSessionUserId with session versions (#208)", () => {
  it("accepts a session issued at the current version", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@x.dev", sessionVersion: 3 } });
    findUnique.mockResolvedValue({ id: "u1", sessionVersion: 3 });
    await expect(resolveSessionUserId()).resolves.toEqual({ userId: "u1" });
  });

  it("rejects a session issued before a password reset", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@x.dev", sessionVersion: 0 } });
    findUnique.mockResolvedValue({ id: "u1", sessionVersion: 1 });
    await expect(resolveSessionUserId()).resolves.toEqual({ error: SESSION_EXPIRED_MESSAGE });
  });

  it("rejects a session issued before a role change bumped the session version (#347)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@x.dev", sessionVersion: 1 } });
    findUnique.mockResolvedValue({ id: "u1", sessionVersion: 2 });
    await expect(resolveSessionUserId()).resolves.toEqual({ error: SESSION_EXPIRED_MESSAGE });
  });

  it("also checks the version on the email fallback path", async () => {
    mockAuth.mockResolvedValue({ user: { id: "stale", email: "a@x.dev", sessionVersion: 0 } });
    findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "u1", sessionVersion: 2 });
    await expect(resolveSessionUserId()).resolves.toEqual({ error: SESSION_EXPIRED_MESSAGE });
  });

  it("rejects a Google session when role is changed (sessionVersion bumped) even when password sign-in is off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_PASSWORD_LOGIN", "false");
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@x.dev", sessionVersion: 0 } });
    findUnique.mockResolvedValue({ id: "u1", sessionVersion: 1 });
    await expect(resolveSessionUserId()).resolves.toEqual({ error: SESSION_EXPIRED_MESSAGE });
  });

  it("accepts a Google session when sessionVersion matches even when password sign-in is off", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_PASSWORD_LOGIN", "false");
    mockAuth.mockResolvedValue({ user: { id: "u1", email: "a@x.dev", sessionVersion: 1 } });
    findUnique.mockResolvedValue({ id: "u1", sessionVersion: 1 });
    await expect(resolveSessionUserId()).resolves.toEqual({ userId: "u1" });
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});
