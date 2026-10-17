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

describe("upsertGoogleUser (#351)", () => {
  it("does not overwrite existing user display name on login", async () => {
    upsert.mockResolvedValueOnce({ id: "db1", name: "Custom Name", role: "user" });
    const result = await upsertGoogleUser({ email: "A@x.dev", name: "Google Name" });

    expect(result).toEqual({ id: "db1", name: "Custom Name", role: "user" });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].where).toEqual({ email: "a@x.dev" });
    expect(upsert.mock.calls[0][0].create.name).toBe("Google Name");
    // Ensure update payload does NOT overwrite name (#351)
    expect(upsert.mock.calls[0][0].update.name).toBeUndefined();
  });

  it("retries with email and without name overwrite when the full upsert fails", async () => {
    upsert.mockRejectedValueOnce(new Error("column image does not exist"));
    upsert.mockResolvedValueOnce({ id: "db2", name: "Custom Name" });
    await expect(upsertGoogleUser({ email: "a@x.dev", name: "Google Name" })).resolves.toEqual({
      id: "db2",
      name: "Custom Name",
      role: "user",
    });
    expect(upsert.mock.calls[1][0].create).toEqual({ email: "a@x.dev", name: "Google Name" });
    expect(upsert.mock.calls[1][0].update).toEqual({});
    expect(upsert.mock.calls[1][0].select).toEqual({ id: true, name: true });
  });

  it("inserts directly with DO NOTHING when Prisma upserts both fail", async () => {
    upsert.mockRejectedValue(new Error("column missing"));
    executeRaw.mockRejectedValueOnce(new Error("passwordHash"));
    executeRaw.mockResolvedValueOnce(1);
    findUnique.mockResolvedValueOnce({ id: "existing", name: "Existing User" });
    await expect(upsertGoogleUser({ email: "a@x.dev" })).resolves.toEqual({
      id: "existing",
      name: "Existing User",
      role: "user",
    });
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(findUnique).toHaveBeenCalledWith({
      where: { email: "a@x.dev" },
      select: { id: true, name: true },
    });
  });
});
