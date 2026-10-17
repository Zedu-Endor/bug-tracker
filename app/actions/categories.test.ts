import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { createCategoryAction, updateCategoryAction } from "./categories";

const findFirstMock = vi.mocked(prisma.category.findFirst) as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = vi.mocked(prisma.category.findUnique) as unknown as ReturnType<typeof vi.fn>;
const createMock = vi.mocked(prisma.category.create) as unknown as ReturnType<typeof vi.fn>;
const updateMock = vi.mocked(prisma.category.update) as unknown as ReturnType<typeof vi.fn>;

describe("categories actions duplicate checks (#139)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCategoryAction", () => {
    it("rejects case-insensitive duplicate category names", async () => {
      findFirstMock.mockResolvedValue({ id: "cat-1", name: "Web" });

      const formData = new FormData();
      formData.set("name", "web ");

      const result = await createCategoryAction(formData);

      expect(result.error).toBe('A platform named "Web" already exists.');
      expect(findFirstMock).toHaveBeenCalledWith({
        where: {
          name: {
            equals: "web",
            mode: "insensitive",
          },
        },
      });
      expect(createMock).not.toHaveBeenCalled();
    });

    it("creates category when name is unique", async () => {
      findFirstMock.mockResolvedValue(null);
      createMock.mockResolvedValue({ id: "cat-2", name: "Mobile", isActive: true });

      const formData = new FormData();
      formData.set("name", "  Mobile  ");

      const result = await createCategoryAction(formData);

      expect(result.ok).toBe(true);
      expect(createMock).toHaveBeenCalledWith({
        data: {
          name: "Mobile",
          isActive: true,
        },
      });
    });
  });

  describe("updateCategoryAction", () => {
    it("rejects case-insensitive duplicate when updating another category", async () => {
      findUniqueMock.mockResolvedValue({ id: "cat-1", name: "Desktop" });
      findFirstMock.mockResolvedValue({ id: "cat-2", name: "Web" });

      const formData = new FormData();
      formData.set("name", "WEB");

      const result = await updateCategoryAction("cat-1", formData);

      expect(result.error).toBe('A platform named "Web" already exists.');
      expect(updateMock).not.toHaveBeenCalled();
    });
  });
});
