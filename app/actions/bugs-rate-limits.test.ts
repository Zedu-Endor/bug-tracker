import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/notify", () => ({ notifyLater: vi.fn() }));
vi.mock("@/lib/session-user", () => ({ resolveSessionUserId: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "user-1", name: "Alice", role: "admin" }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    bug: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    bugActivity: {
      create: vi.fn(),
    },
    issueWatch: {
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        bug: { update: vi.fn() },
        bugActivity: { create: vi.fn() },
        issueWatch: { createMany: vi.fn(), upsert: vi.fn() },
      };
      return fn(tx);
    }),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  ACTION_RATE_LIMITS,
  RATE_LIMIT_MESSAGE,
  resetRateLimits,
} from "@/lib/rate-limit";
import { editBugContentAction, selfAssignBugAction } from "./bugs";

const mockBugFindUnique = vi.mocked(prisma.bug.findUnique) as unknown as ReturnType<typeof vi.fn>;

describe("action rate limits on bug edits and self-assign (#350)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimits();
  });

  describe("editBugContentAction rate limiting", () => {
    it("returns error when edit limit is exceeded", async () => {
      mockBugFindUnique.mockResolvedValue({
        id: "bug-1",
        title: "Original Title",
        description: "Original Description",
        reporterId: "user-1",
        isDeleted: false,
      });

      const max = ACTION_RATE_LIMITS.editBug.max;
      for (let i = 0; i < max; i++) {
        const formData = new FormData();
        formData.set("title", `Title ${i}`);
        formData.set("description", `Description ${i}`);
        const result = await editBugContentAction("bug-1", formData);
        expect(result).toEqual({ ok: true });
      }

      const formData = new FormData();
      formData.set("title", "Too fast title");
      formData.set("description", "Too fast description");
      const blocked = await editBugContentAction("bug-1", formData);
      expect(blocked).toEqual({ error: RATE_LIMIT_MESSAGE });
    });
  });

  describe("selfAssignBugAction rate limiting", () => {
    it("returns error when self-assignment limit is exceeded", async () => {
      mockBugFindUnique.mockResolvedValue({
        id: "bug-1",
        title: "Test Bug",
        assigneeId: null,
        isDeleted: false,
        assignee: null,
      });

      const max = ACTION_RATE_LIMITS.selfAssign.max;
      for (let i = 0; i < max; i++) {
        // Toggle assign/unassign
        const result = await selfAssignBugAction("bug-1", true);
        expect(result).toEqual({ ok: true });
      }

      const blocked = await selfAssignBugAction("bug-1", true);
      expect(blocked).toEqual({ error: RATE_LIMIT_MESSAGE });
    });
  });
});
