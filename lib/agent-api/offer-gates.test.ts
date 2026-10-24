import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/redesigns", () => ({ assertRedesignOpen: vi.fn(async () => undefined) }));
vi.mock("@/lib/approvals", () => ({ assertApprovalOpen: vi.fn(async () => undefined) }));
vi.mock("@/lib/agent-api/events", () => ({ publish: vi.fn(async () => ({ id: "evt" })) }));
vi.mock("@/lib/agent-notifications", () => ({ notifyClaimOffered: vi.fn() }));

import { assertRedesignOpen } from "@/lib/redesigns";
import { assertApprovalOpen } from "@/lib/approvals";
import { IssueApiError } from "@/lib/agent-api/issues";
import { offerGatesOpen, offerNext } from "./offer";

/** A database with the tables the gates and offerNext look at. */
function makeDb() {
  return {
    redesignProposal: { count: vi.fn() },
    issueClaim: { findFirst: vi.fn(async () => null), create: vi.fn() },
    projectWorkflow: { findUnique: vi.fn(async () => null) },
    membership: { findMany: vi.fn(async () => []) },
    $queryRaw: vi.fn(async () => [{ id: "issue1" }]),
  };
}

const bug = { id: "issue1", projectId: "project", title: "Broken login" };

beforeEach(() => vi.clearAllMocks());

describe("offerGatesOpen (#508)", () => {
  it("is open when no redesign waits and no approval is pending", async () => {
    const db = makeDb();
    await expect(offerGatesOpen(db as never, "issue1", "tenant")).resolves.toBe(true);
    expect(assertRedesignOpen).toHaveBeenCalledWith("issue1", db);
    expect(assertApprovalOpen).toHaveBeenCalledWith("issue1", "before_offer", { db, tenantId: "tenant" });
  });

  it("is closed while a redesign is waiting for a person", async () => {
    vi.mocked(assertRedesignOpen).mockRejectedValueOnce(new IssueApiError(409, "This redesign is waiting for a person."));
    await expect(offerGatesOpen(makeDb() as never, "issue1", "tenant")).resolves.toBe(false);
  });

  it("is closed while a before_offer approval is pending", async () => {
    vi.mocked(assertApprovalOpen).mockRejectedValueOnce(new IssueApiError(409, "waiting_for_human", { approvalId: "ap1" }));
    await expect(offerGatesOpen(makeDb() as never, "issue1", "tenant")).resolves.toBe(false);
  });

  it("rethrows anything that is not a closed gate", async () => {
    vi.mocked(assertApprovalOpen).mockRejectedValueOnce(new Error("db down"));
    await expect(offerGatesOpen(makeDb() as never, "issue1", "tenant")).rejects.toThrow("db down");
  });
});

describe("offerNext runs the gates on every offer path (#508)", () => {
  it("makes no offer, after taking the issue lock, while a redesign is waiting", async () => {
    const db = makeDb();
    vi.mocked(assertRedesignOpen).mockRejectedValueOnce(new IssueApiError(409, "This redesign is waiting for a person."));
    await expect(offerNext(db as never, { tenantId: "tenant" }, bug)).resolves.toBeNull();
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    expect(db.issueClaim.findFirst).not.toHaveBeenCalled();
    expect(db.issueClaim.create).not.toHaveBeenCalled();
  });

  it("makes no offer while a before_offer approval is pending, whoever calls (sweep or dispatcher)", async () => {
    const db = makeDb();
    vi.mocked(assertApprovalOpen).mockRejectedValueOnce(new IssueApiError(409, "waiting_for_human", { approvalId: "ap1" }));
    await expect(offerNext(db as never, { tenantId: "tenant", agentId: "dispatcher1", level: "dispatcher" }, bug)).resolves.toBeNull();
    expect(db.issueClaim.create).not.toHaveBeenCalled();
  });

  it("goes on to look for a candidate when both gates are open", async () => {
    const db = makeDb();
    await offerNext(db as never, { tenantId: "tenant" }, bug);
    expect(db.issueClaim.findFirst).toHaveBeenCalled();
  });
});
