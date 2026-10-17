import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }),
}));

vi.mock("@/lib/prisma", () => {
  const db = {
    category: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    bug: {
      findMany: vi.fn(),
    },
    bugActivity: {
      createMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (client: typeof db) => unknown) => fn(db)),
  };
  return { prisma: db };
});

import { prisma } from "@/lib/prisma";
import { createCategoryAction, updateCategoryAction } from "./categories";

const findFirstMock = vi.mocked(prisma.category.findFirst) as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = vi.mocked(prisma.category.findUnique) as unknown as ReturnType<typeof vi.fn>;
const createMock = vi.mocked(prisma.category.create) as unknown as ReturnType<typeof vi.fn>;
const updateMock = vi.mocked(prisma.category.update) as unknown as ReturnType<typeof vi.fn>;
const bugFindManyMock = vi.mocked(prisma.bug.findMany) as unknown as ReturnType<typeof vi.fn>;
const bugActivityCreateManyMock = vi.mocked(prisma.bugActivity.createMany) as unknown as ReturnType<typeof vi.fn>;

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

      expect(result.error).toBe('A category named "Web" already exists.');
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

      expect(result.error).toBe('A category named "Web" already exists.');
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("records BugActivity entries on linked issues when category is renamed (#365)", async () => {
      findUniqueMock.mockResolvedValue({ id: "cat-1", name: "Web" });
      findFirstMock.mockResolvedValue(null);
      updateMock.mockResolvedValue({ id: "cat-1", name: "Frontend" });
      bugFindManyMock.mockResolvedValue([{ id: "bug-101" }, { id: "bug-102" }]);
      bugActivityCreateManyMock.mockResolvedValue({ count: 2 });

      const formData = new FormData();
      formData.set("name", "Frontend");

      const result = await updateCategoryAction("cat-1", formData);

      expect(result.ok).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "cat-1" },
        data: { name: "Frontend" },
      });
      expect(bugActivityCreateManyMock).toHaveBeenCalledWith({
        data: [
          {
            bugId: "bug-101",
            actorId: "admin-1",
            type: "category_changed",
            summary: "changed category from Web to Frontend",
            metadata: {
              field: "category",
              from: "Web",
              to: "Frontend",
            },
          },
          {
            bugId: "bug-102",
            actorId: "admin-1",
            type: "category_changed",
            summary: "changed category from Web to Frontend",
            metadata: {
              field: "category",
              from: "Web",
              to: "Frontend",
            },
          },
        ],
      });
    });

    it("does not record BugActivity when category name is not changed", async () => {
      findUniqueMock.mockResolvedValue({ id: "cat-1", name: "Web" });
      findFirstMock.mockResolvedValue(null);
      updateMock.mockResolvedValue({ id: "cat-1", name: "Web" });

      const formData = new FormData();
      formData.set("name", "Web");

      const result = await updateCategoryAction("cat-1", formData);

      expect(result.ok).toBe(true);
      expect(bugActivityCreateManyMock).not.toHaveBeenCalled();
    });
  });
});
