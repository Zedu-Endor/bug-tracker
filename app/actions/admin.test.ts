import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireSuperAdmin: vi.fn().mockResolvedValue({ id: "super-1", role: "super_admin" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ROLE_CHANGE_ERRORS } from "@/lib/role-changes";
import { promoteUserToAdminAction, demoteUserToUserAction } from "./admin";

const findUniqueMock = vi.mocked(prisma.user.findUnique) as unknown as ReturnType<typeof vi.fn>;
const updateMock = vi.mocked(prisma.user.update) as unknown as ReturnType<typeof vi.fn>;
const revalidatePathMock = vi.mocked(revalidatePath) as unknown as ReturnType<typeof vi.fn>;

describe("admin role change actions (#347)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("promoteUserToAdminAction", () => {
    it("updates role to admin and increments sessionVersion to invalidate existing JWTs", async () => {
      findUniqueMock.mockResolvedValue({ id: "target-user", role: "user" });
      updateMock.mockResolvedValue({ id: "target-user", role: "admin" });

      const result = await promoteUserToAdminAction("target-user");

      expect(result).toEqual({ ok: true });
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "target-user" },
        data: {
          role: "admin",
          sessionVersion: { increment: 1 },
        },
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    });

    it("refuses promotion if target is already admin", async () => {
      findUniqueMock.mockResolvedValue({ id: "target-admin", role: "admin" });

      const result = await promoteUserToAdminAction("target-admin");

      expect(result.error).toBe(ROLE_CHANGE_ERRORS["already-admin"]);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });

  describe("demoteUserToUserAction", () => {
    it("updates role to user and increments sessionVersion to invalidate existing JWTs", async () => {
      findUniqueMock.mockResolvedValue({ id: "target-admin", role: "admin" });
      updateMock.mockResolvedValue({ id: "target-admin", role: "user" });

      const result = await demoteUserToUserAction("target-admin");

      expect(result).toEqual({ ok: true });
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "target-admin" },
        data: {
          role: "user",
          sessionVersion: { increment: 1 },
        },
      });
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin/users");
      expect(revalidatePathMock).toHaveBeenCalledWith("/admin");
    });

    it("refuses demoting another super admin", async () => {
      findUniqueMock.mockResolvedValue({ id: "other-super", role: "super_admin" });

      const result = await demoteUserToUserAction("other-super");

      expect(result.error).toBe(ROLE_CHANGE_ERRORS["super-admin"]);
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("refuses demoting self", async () => {
      findUniqueMock.mockResolvedValue({ id: "super-1", role: "super_admin" });

      const result = await demoteUserToUserAction("super-1");

      expect(result.error).toBe(ROLE_CHANGE_ERRORS["self"]);
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
