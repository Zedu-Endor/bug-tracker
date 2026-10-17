import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  UserHasReportedBugsError,
  offboardUser,
} from "./user-offboarding";

describe("user offboarding (#356)", () => {
  const mockClient = {
    user: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    bug: {
      updateMany: vi.fn(),
      count: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws if the target user does not exist", async () => {
    mockClient.user.findUnique.mockResolvedValue(null);

    await expect(
      offboardUser(mockClient as never, "user-unknown"),
    ).rejects.toThrow('User with ID "user-unknown" not found.');
  });

  it("unassigns issues and deletes user when user has no reported bugs", async () => {
    mockClient.user.findUnique.mockResolvedValue({ id: "user-1" });
    mockClient.bug.updateMany.mockResolvedValue({ count: 3 });
    mockClient.bug.count.mockResolvedValue(0);
    mockClient.user.delete.mockResolvedValue({ id: "user-1" });

    const result = await offboardUser(mockClient as never, "user-1");

    expect(result).toEqual({
      ok: true,
      userId: "user-1",
      unassignedBugCount: 3,
      reassignedBugCount: 0,
    });
    expect(mockClient.bug.updateMany).toHaveBeenCalledWith({
      where: { assigneeId: "user-1" },
      data: { assigneeId: null },
    });
    expect(mockClient.user.delete).toHaveBeenCalledWith({
      where: { id: "user-1" },
    });
  });

  it("throws UserHasReportedBugsError if user reported bugs but no fallback is provided", async () => {
    mockClient.user.findUnique.mockResolvedValue({ id: "user-reporter" });
    mockClient.bug.count.mockResolvedValue(5);

    await expect(
      offboardUser(mockClient as never, "user-reporter"),
    ).rejects.toThrow(UserHasReportedBugsError);

    expect(mockClient.bug.updateMany).not.toHaveBeenCalled();
    expect(mockClient.user.delete).not.toHaveBeenCalled();
  });

  it("throws if the specified fallback reporter does not exist", async () => {
    mockClient.user.findUnique
      .mockResolvedValueOnce({ id: "user-reporter" })
      .mockResolvedValueOnce(null); // fallback lookup
    mockClient.bug.count.mockResolvedValue(2);

    await expect(
      offboardUser(mockClient as never, "user-reporter", {
        fallbackReporterId: "fallback-missing",
      }),
    ).rejects.toThrow('Fallback reporter user "fallback-missing" not found.');

    expect(mockClient.bug.updateMany).not.toHaveBeenCalled();
    expect(mockClient.user.delete).not.toHaveBeenCalled();
  });

  it("throws if fallbackReporterId is the user being offboarded", async () => {
    mockClient.user.findUnique.mockResolvedValue({ id: "user-same" });
    mockClient.bug.count.mockResolvedValue(2);

    await expect(
      offboardUser(mockClient as never, "user-same", {
        fallbackReporterId: "user-same",
      }),
    ).rejects.toThrow("fallbackReporterId must differ from the user being offboarded.");

    expect(mockClient.bug.updateMany).not.toHaveBeenCalled();
    expect(mockClient.user.delete).not.toHaveBeenCalled();
  });

  it("reassigns reported bugs to fallback reporter, unassigns assigned bugs, and deletes user", async () => {
    mockClient.user.findUnique
      .mockResolvedValueOnce({ id: "user-retiring" })
      .mockResolvedValueOnce({ id: "admin-bot" });
    mockClient.bug.updateMany
      .mockResolvedValueOnce({ count: 4 }) // unassigned bugs
      .mockResolvedValueOnce({ count: 2 }); // reassigned reported bugs
    mockClient.bug.count.mockResolvedValue(2);
    mockClient.user.delete.mockResolvedValue({ id: "user-retiring" });

    const result = await offboardUser(mockClient as never, "user-retiring", {
      fallbackReporterId: "admin-bot",
    });

    expect(result).toEqual({
      ok: true,
      userId: "user-retiring",
      unassignedBugCount: 4,
      reassignedBugCount: 2,
    });
    expect(mockClient.bug.updateMany).toHaveBeenNthCalledWith(1, {
      where: { assigneeId: "user-retiring" },
      data: { assigneeId: null },
    });
    expect(mockClient.bug.updateMany).toHaveBeenNthCalledWith(2, {
      where: { reporterId: "user-retiring" },
      data: { reporterId: "admin-bot" },
    });
    expect(mockClient.user.delete).toHaveBeenCalledWith({
      where: { id: "user-retiring" },
    });
  });

  it("wraps in transaction when client has $transaction method", async () => {
    const txMock = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "user-tx" }),
        delete: vi.fn().mockResolvedValue({ id: "user-tx" }),
      },
      bug: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
    };
    const clientWithTx = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(txMock)),
    };

    const result = await offboardUser(clientWithTx as never, "user-tx");
    expect(clientWithTx.$transaction).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    expect(result.userId).toBe("user-tx");
  });
});
