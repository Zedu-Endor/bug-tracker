import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin-1", role: "admin" }),
}));

vi.mock("@/lib/prisma", () => {
  const db = {
    issueType: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    bug: {
      count: vi.fn(),
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
import {
  createIssueTypeAction,
  deleteIssueTypeAction,
  updateIssueTypeAction,
} from "./issue-types";

const findFirstMock = vi.mocked(prisma.issueType.findFirst) as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = vi.mocked(prisma.issueType.findUnique) as unknown as ReturnType<typeof vi.fn>;
const createMock = vi.mocked(prisma.issueType.create) as unknown as ReturnType<typeof vi.fn>;
const updateMock = vi.mocked(prisma.issueType.update) as unknown as ReturnType<typeof vi.fn>;
const deleteMock = vi.mocked(prisma.issueType.delete) as unknown as ReturnType<typeof vi.fn>;
const bugCountMock = vi.mocked(prisma.bug.count) as unknown as ReturnType<typeof vi.fn>;
const bugFindManyMock = vi.mocked(prisma.bug.findMany) as unknown as ReturnType<typeof vi.fn>;
const bugActivityCreateManyMock = vi.mocked(prisma.bugActivity.createMany) as unknown as ReturnType<typeof vi.fn>;

/** The error Prisma throws when the row to update/delete no longer exists. */
const recordNotFound = Object.assign(new Error("Record to delete does not exist."), {
  code: "P2025",
});

describe("issue-types actions duplicate checks (#139)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createIssueTypeAction", () => {
    it("rejects case-insensitive duplicate type names", async () => {
      findFirstMock.mockResolvedValue({ id: "type-1", name: "Fix" });

      const formData = new FormData();
      formData.set("name", "fix ");

      const result = await createIssueTypeAction(formData);

      expect(result.error).toBe('A type named "Fix" already exists.');
      expect(findFirstMock).toHaveBeenCalledWith({
        where: {
          name: {
            equals: "fix",
            mode: "insensitive",
          },
        },
      });
      expect(createMock).not.toHaveBeenCalled();
    });

    it("creates type when name is unique", async () => {
      findFirstMock.mockResolvedValue(null);
      createMock.mockResolvedValue({ id: "type-2", name: "Feat", isActive: true });

      const formData = new FormData();
      formData.set("name", "  Feat  ");

      const result = await createIssueTypeAction(formData);

      expect(result.ok).toBe(true);
      expect(createMock).toHaveBeenCalledWith({
        data: {
          name: "Feat",
          description: null,
          isActive: true,
        },
      });
    });
  });

  describe("updateIssueTypeAction", () => {
    it("rejects case-insensitive duplicate when updating to an existing type name", async () => {
      findUniqueMock.mockResolvedValue({ id: "type-2", name: "Feature" });
      findFirstMock.mockResolvedValue({ id: "type-1", name: "Design" });

      const formData = new FormData();
      formData.set("name", "DESIGN");

      const result = await updateIssueTypeAction("type-2", formData);

      expect(result.error).toBe('Another type named "Design" already exists.');
      expect(updateMock).not.toHaveBeenCalled();
    });

    it("records BugActivity on linked issues when issue type name is renamed (#365)", async () => {
      findUniqueMock.mockResolvedValue({ id: "type-1", name: "Bug" });
      findFirstMock.mockResolvedValue(null);
      updateMock.mockResolvedValue({ id: "type-1", name: "Defect" });
      bugFindManyMock.mockResolvedValue([{ id: "bug-1" }, { id: "bug-2" }]);
      bugActivityCreateManyMock.mockResolvedValue({ count: 2 });

      const formData = new FormData();
      formData.set("name", "Defect");

      const result = await updateIssueTypeAction("type-1", formData);

      expect(result.ok).toBe(true);
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: "type-1" },
        data: {
          name: "Defect",
          description: null,
          isActive: true,
        },
      });
      expect(bugActivityCreateManyMock).toHaveBeenCalledWith({
        data: [
          {
            bugId: "bug-1",
            actorId: "admin-1",
            type: "type_changed",
            summary: "changed type from Bug to Defect",
            metadata: {
              field: "type",
              from: "Bug",
              to: "Defect",
            },
          },
          {
            bugId: "bug-2",
            actorId: "admin-1",
            type: "type_changed",
            summary: "changed type from Bug to Defect",
            metadata: {
              field: "type",
              from: "Bug",
              to: "Defect",
            },
          },
        ],
      });
    });

    it("does not record BugActivity when issue type name is unchanged", async () => {
      findUniqueMock.mockResolvedValue({ id: "type-1", name: "Bug" });
      findFirstMock.mockResolvedValue(null);
      updateMock.mockResolvedValue({ id: "type-1", name: "Bug" });

      const formData = new FormData();
      formData.set("name", "Bug");

      const result = await updateIssueTypeAction("type-1", formData);

      expect(result.ok).toBe(true);
      expect(bugActivityCreateManyMock).not.toHaveBeenCalled();
    });
  });
});

describe("issue-types actions on a type that no longer exists (#227)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 'Type not found' when updating a type deleted in another tab", async () => {
    findUniqueMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue(null);
    updateMock.mockRejectedValue(recordNotFound);

    const formData = new FormData();
    formData.set("name", "Design");

    const result = await updateIssueTypeAction("type-gone", formData);

    expect(result).toEqual({ error: "Type not found" });
  });

  it("returns 'Type not found' when deleting a type that is already gone", async () => {
    findUniqueMock.mockResolvedValue(null);

    const result = await deleteIssueTypeAction("type-gone");

    expect(result).toEqual({ error: "Type not found" });
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("returns 'Type not found' when the type is deleted between the check and the delete", async () => {
    findUniqueMock.mockResolvedValue({ id: "type-1" });
    bugCountMock.mockResolvedValue(0);
    deleteMock.mockRejectedValue(recordNotFound);

    const result = await deleteIssueTypeAction("type-1");

    expect(result).toEqual({ error: "Type not found" });
  });

  it("still deletes an unused type that exists", async () => {
    findUniqueMock.mockResolvedValue({ id: "type-1" });
    bugCountMock.mockResolvedValue(0);
    deleteMock.mockResolvedValue({ id: "type-1" });

    const result = await deleteIssueTypeAction("type-1");

    expect(result).toEqual({ ok: true });
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "type-1" } });
  });
});
