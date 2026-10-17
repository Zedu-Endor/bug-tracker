import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { upsert: vi.fn(), findUnique: vi.fn() },
    $executeRaw: vi.fn(),
  },
}));
vi.mock("@/lib/super-admin", () => ({ isSuperAdminEmail: () => false }));

import { prisma } from "@/lib/prisma";
import { upsertGoogleUser } from "./google-user";

const upsert = prisma.user.upsert as unknown as ReturnType<typeof vi.fn>;
const findUnique = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;
const executeRaw = prisma.$executeRaw as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("upsertGoogleUser", () => {
  it("returns the database id and sessionVersion from the full upsert", async () => {
    upsert.mockResolvedValueOnce({ id: "db1", role: "user", sessionVersion: 0 });
    await expect(
      upsertGoogleUser({ email: "A@x.dev", name: "Ada" }),
    ).resolves.toEqual({ id: "db1", role: "user", sessionVersion: 0 });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where).toEqual({ email: "a@x.dev" });
  });

  it("never overwrites the name of an existing account (#293)", async () => {
    // A display name chosen in Settings must survive the next Google sign-in.
    upsert.mockResolvedValueOnce({ id: "db1", role: "user" });
    await upsertGoogleUser({ email: "a@x.dev", name: "Google Name", image: "https://img.test/a.png" });
    const { create, update } = upsert.mock.calls[0][0];
    expect(create.name).toBe("Google Name");
    expect(update).not.toHaveProperty("name");
    expect(update.image).toBe("https://img.test/a.png");
  });

  it("retries with email and name when the full upsert fails", async () => {
    upsert.mockRejectedValueOnce(new Error("column image does not exist"));
    upsert.mockResolvedValueOnce({ id: "db2", sessionVersion: 0 });
    await expect(upsertGoogleUser({ email: "a@x.dev", name: "Ada" })).resolves.toEqual({
      id: "db2",
      role: "user",
      sessionVersion: 0,
    });
    expect(upsert.mock.calls[1][0].create).toEqual({ email: "a@x.dev", name: "Ada" });
    expect(upsert.mock.calls[1][0].select).toEqual({ id: true, sessionVersion: true });
  });

  it("inserts directly when Prisma upserts both fail", async () => {
    upsert.mockRejectedValue(new Error("column missing"));
    executeRaw.mockRejectedValueOnce(new Error("passwordHash"));
    executeRaw.mockResolvedValueOnce(1);
    findUnique.mockResolvedValueOnce({ id: "existing", sessionVersion: 0 });
    await expect(upsertGoogleUser({ email: "a@x.dev" })).resolves.toEqual({
      id: "existing",
      role: "user",
      sessionVersion: 0,
    });
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: "a@x.dev" },
      select: { id: true, sessionVersion: true },
    });
  });
});
