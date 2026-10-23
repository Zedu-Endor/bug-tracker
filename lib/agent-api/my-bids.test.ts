import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  issueBid: { findMany: vi.fn(), groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { listCallerOpenBids, parseBidScope } from "./my-bids";

const caller = {
  agentId: "agent1",
  name: "Ada's Claude",
  ownerId: "ada",
  tenantId: "tenant",
  level: "contributor" as const,
  burst: false,
  keyId: "key1",
};

const bid = {
  id: "bid1",
  note: "I can take this",
  createdAt: new Date("2026-10-19T12:00:00.000Z"),
  agentId: "agent1",
  agent: { name: "Ada's Claude" },
  bug: { id: "issue1", number: 42, title: "Fix login", status: "open", severity: "medium" as const },
};

beforeEach(() => {
  vi.clearAllMocks();
  db.issueBid.findMany.mockResolvedValue([bid]);
  db.issueBid.groupBy.mockResolvedValue([{ bugId: "issue1", _count: { _all: 3 } }]);
});

describe("parseBidScope", () => {
  it("defaults to the calling agent", () => {
    expect(parseBidScope(null)).toBe("agent");
    expect(parseBidScope("agent")).toBe("agent");
  });

  it("accepts owner scope", () => {
    expect(parseBidScope("owner")).toBe("owner");
  });

  it("rejects an unknown scope", () => {
    expect(() => parseBidScope("everyone")).toThrow(/scope must be/);
  });
});

describe("listCallerOpenBids", () => {
  it("lists open bids placed by this agent with rival counts", async () => {
    const result = await listCallerOpenBids(caller, "project");

    const where = db.issueBid.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ withdrawnAt: null, awardedAt: null, agentId: "agent1" });
    expect(where.bug).toMatchObject({ projectId: "project", tenantId: "tenant", isDeleted: false });
    expect(result).toEqual([
      {
        id: "bid1",
        issueId: "issue1",
        number: 42,
        title: "Fix login",
        status: "open",
        severity: "medium",
        note: "I can take this",
        createdAt: bid.createdAt,
        agentId: "agent1",
        agentName: "Ada's Claude",
        rivalBids: 2,
      },
    ]);
  });

  it("widens to every agent of the same owner for scope=owner", async () => {
    await listCallerOpenBids(caller, "project", "owner");

    const where = db.issueBid.findMany.mock.calls[0][0].where;
    expect(where.beneficiaryUserId).toBe("ada");
    expect(where.agentId).toBeUndefined();
  });

  it("returns early without counting rivals when the agent has no bids", async () => {
    db.issueBid.findMany.mockResolvedValue([]);

    await expect(listCallerOpenBids(caller, "project")).resolves.toEqual([]);
    expect(db.issueBid.groupBy).not.toHaveBeenCalled();
  });
});
