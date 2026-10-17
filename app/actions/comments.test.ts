import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "author-1", name: "Ada", role: "user" }),
}));

vi.mock("@/lib/notify", () => ({
  notifyLater: vi.fn(),
}));

vi.mock("@/lib/prisma", () => {
  const tx = {
    comment: { update: vi.fn() },
    bugActivity: { updateMany: vi.fn() },
  };
  return {
    prisma: {
      comment: {
        findUnique: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    },
  };
});

import { prisma } from "@/lib/prisma";
import { notifyLater } from "@/lib/notify";
import { updateCommentAction } from "./comments";

const findCommentMock = vi.mocked(prisma.comment.findUnique) as unknown as ReturnType<typeof vi.fn>;
const findUsersMock = vi.mocked(prisma.user.findMany) as unknown as ReturnType<typeof vi.fn>;
const notifyMock = vi.mocked(notifyLater);

const bobId = "clxxxxxxxxxxxxxxxxxxxxxxxx2";
const carolId = "clxxxxxxxxxxxxxxxxxxxxxxxx3";

function existingComment(body: string) {
  return {
    id: "comment-1",
    bugId: "bug-1",
    authorId: "author-1",
    body,
    deletedAt: null,
    author: { name: "Ada" },
    bug: { isDeleted: false, title: "Login button does nothing" },
  };
}

function edit(body: string) {
  const formData = new FormData();
  formData.set("body", body);
  return updateCommentAction("comment-1", formData);
}

describe("updateCommentAction mention notifications (#228)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUsersMock.mockResolvedValue([
      { id: bobId, name: "Bob" },
      { id: carolId, name: "Carol" },
    ]);
  });

  it("notifies a person newly tagged by the edit", async () => {
    findCommentMock.mockResolvedValue(existingComment("Can someone check this?"));

    const result = await edit(`Can someone check this? @[Bob](${bobId})`);

    expect(result).toEqual({ ok: true });
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "mentioned",
        place: "comment",
        actorId: "author-1",
        bugId: "bug-1",
        bugTitle: "Login button does nothing",
        recipientIds: [bobId],
      }),
    );
  });

  it("only notifies the new person, not people already tagged", async () => {
    findCommentMock.mockResolvedValue(existingComment(`cc @[Bob](${bobId})`));

    await edit(`cc @[Bob](${bobId}) @[Carol](${carolId})`);

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: [carolId] }),
    );
  });

  it("sends nothing when the edit adds no new mentions", async () => {
    findCommentMock.mockResolvedValue(existingComment(`cc @[Bob](${bobId})`));

    await edit(`cc @[Bob](${bobId}), fixed a typo`);

    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("enforces rate limit when editing comments rapidly (#350)", async () => {
    const { resetRateLimits, ACTION_RATE_LIMITS, RATE_LIMIT_MESSAGE } = await import("@/lib/rate-limit");
    resetRateLimits();
    findCommentMock.mockResolvedValue(existingComment("Initial comment"));

    for (let i = 0; i < ACTION_RATE_LIMITS.editComment.max; i++) {
      const res = await edit(`Edit iteration ${i}`);
      expect(res).toEqual({ ok: true });
    }

    const blocked = await edit("One edit too many");
    expect(blocked).toEqual({ error: RATE_LIMIT_MESSAGE });
  });
});
