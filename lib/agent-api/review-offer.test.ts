import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isReviewOfferExpired,
  isReviewDeadlineExpired,
  rankReviewOfferCandidates,
  createReviewOffers,
  acceptReviewOffer,
  expireReviewOffer,
  handleTestVerdictSubmitted,
  REVIEW_OFFER_TTL_MS,
  REVIEW_DEADLINE_MS,
} from "./review-offer";
import { IssueApiError } from "@/lib/agent-api/issues";

const db = vi.hoisted(() => ({
  bug: { findFirst: vi.fn(), update: vi.fn() },
  membership: { findMany: vi.fn() },
  issueClaim: { groupBy: vi.fn() },
  reviewOffer: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    groupBy: vi.fn(),
  },
  agentEvent: { create: vi.fn(), findFirst: vi.fn() },
  webhookSubscription: { findMany: vi.fn() },
  webhookDelivery: { createMany: vi.fn() },
  testVerdict: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: db }));

describe("review offer TTL and deadlines (#597)", () => {
  it("expires an offer after 60 seconds", () => {
    const offeredAt = new Date("2026-10-20T12:00:00.000Z");
    const t0 = offeredAt.getTime();
    expect(isReviewOfferExpired(offeredAt, t0 + REVIEW_OFFER_TTL_MS - 1)).toBe(false);
    expect(isReviewOfferExpired(offeredAt, t0 + REVIEW_OFFER_TTL_MS)).toBe(true);
    expect(isReviewOfferExpired(null, t0)).toBe(true);
  });

  it("expires a review deadline after 30 minutes", () => {
    const deadlineAt = new Date("2026-10-20T12:30:00.000Z");
    const t0 = deadlineAt.getTime();
    expect(isReviewDeadlineExpired(deadlineAt, t0 - 1)).toBe(false);
    expect(isReviewDeadlineExpired(deadlineAt, t0)).toBe(true);
    expect(isReviewDeadlineExpired(null, t0)).toBe(true);
  });
});

describe("fairness order for review offers (#597)", () => {
  it("ranks candidates by lowest active workload, then oldest offer, then name", () => {
    const t1 = new Date("2026-10-20T10:00:00.000Z");
    const t2 = new Date("2026-10-20T11:00:00.000Z");
    const candidates = [
      { beneficiaryUserId: "carol", agentId: "ac", activeWorkload: 1, lastOfferedAt: null },
      { beneficiaryUserId: "bob", agentId: "ab", activeWorkload: 0, lastOfferedAt: t2 },
      { beneficiaryUserId: "alice", agentId: "aa", activeWorkload: 0, lastOfferedAt: t1 },
      { beneficiaryUserId: "dave", agentId: "ad", activeWorkload: 0, lastOfferedAt: null },
    ];

    const ranked = rankReviewOfferCandidates(candidates);
    expect(ranked.map((c) => c.beneficiaryUserId)).toEqual(["dave", "alice", "bob", "carol"]);
  });
});

describe("createReviewOffers independence and selection (#597)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
    db.issueClaim.groupBy.mockResolvedValue([]);
    db.reviewOffer.groupBy.mockResolvedValue([]);
    db.reviewOffer.findMany.mockResolvedValue([]);
    db.reviewOffer.create.mockImplementation(({ data }: { data: unknown }) =>
      Promise.resolve({ id: "offer-created", ...(data as Record<string, unknown>) }),
    );
    db.agentEvent.create.mockResolvedValue({ id: "evt-1" });
    db.webhookSubscription.findMany.mockResolvedValue([]);
  });

  const solverUserId = "solver-alice";
  const solverAgentId = "solver-agent-1";
  const prUrl = "https://github.com/zedu/web/pull/123";

  function makeBug(claims = [{ status: "active", releasedAt: null, agentId: solverAgentId, agent: { ownerUserId: solverUserId } }]) {
    return {
      id: "bug-123",
      tenantId: "tenant-zedu",
      projectId: "proj-1",
      title: "Fix crash on export",
      status: "open",
      pullRequestUrl: prUrl,
      beneficiaryUserId: solverUserId,
      reporterId: "reporter-rob",
      createdByAgentId: null,
      createdByAgent: null,
      claims,
    };
  }

  it("creates review offers for independent reviewers only", async () => {
    const bug = makeBug();
    db.bug.findFirst.mockResolvedValue(bug);

    // 4 members in tenant:
    // 1. solver Alice (has active claim -> NOT independent)
    // 2. reporter Rob (reporter -> NOT independent)
    // 3. Bob (independent, reviewer level)
    // 4. Carol (independent, reviewer level)
    db.membership.findMany.mockResolvedValue([
      { userId: solverUserId, user: { agents: [{ id: "agent-alice-2" }] } },
      { userId: "reporter-rob", user: { agents: [{ id: "agent-rob" }] } },
      { userId: "bob", user: { agents: [{ id: "agent-bob" }] } },
      { userId: "carol", user: { agents: [{ id: "agent-carol" }] } },
    ]);

    const result = await createReviewOffers(
      db as never,
      { agentId: solverAgentId, tenantId: "tenant-zedu" },
      "bug-123",
      { pullRequestUrl: prUrl, verdictsNeeded: 2 },
    );

    expect(result.offers).toHaveLength(2);
    expect(result.offers.map((o) => o.beneficiaryUserId)).toEqual(["bob", "carol"]);

    // Verify review.requested event was published for each chosen reviewer
    expect(db.agentEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "review.requested",
        tenantId: "tenant-zedu",
        bugId: "bug-123",
        payload: expect.objectContaining({
          issueId: "bug-123",
          agentId: "agent-bob",
          beneficiaryUserId: "bob",
          pullRequestUrl: prUrl,
        }),
      }),
    }));
    expect(db.agentEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "review.requested",
        tenantId: "tenant-zedu",
        bugId: "bug-123",
        payload: expect.objectContaining({
          issueId: "bug-123",
          agentId: "agent-carol",
          beneficiaryUserId: "carol",
          pullRequestUrl: prUrl,
        }),
      }),
    }));
  });

  it("ensures each selected reviewer has a distinct owner", async () => {
    const bug = makeBug();
    db.bug.findFirst.mockResolvedValue(bug);

    // If Bob has 2 agents or multiple memberships, only 1 reviewer for Bob is selected
    db.membership.findMany.mockResolvedValue([
      { userId: "bob", user: { agents: [{ id: "agent-bob-1" }] } },
      { userId: "bob", user: { agents: [{ id: "agent-bob-2" }] } },
      { userId: "carol", user: { agents: [{ id: "agent-carol" }] } },
    ]);

    const result = await createReviewOffers(
      db as never,
      { agentId: solverAgentId, tenantId: "tenant-zedu" },
      "bug-123",
      { pullRequestUrl: prUrl, verdictsNeeded: 2 },
    );

    const owners = result.offers.map((o) => o.beneficiaryUserId);
    expect(owners).toEqual(["bob", "carol"]);
    expect(new Set(owners).size).toBe(2);
  });
});

describe("acceptReviewOffer (#597)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  });

  const agentCtx = {
    agentId: "agent-bob",
    name: "bob-agent",
    ownerId: "bob",
    tenantId: "tenant-zedu",
    level: "reviewer" as const,
    burst: false,
    keyId: "k1",
  };

  it.each([
    { reporterId: "bob" },
    { createdByAgent: { ownerUserId: "bob" } },
    { assigneeId: "bob" },
  ])("rejects an offer that is no longer independent (%#)", async (ownership) => {
    db.reviewOffer.findUnique.mockResolvedValue({ id: "offer-1", bugId: "bug-123", agentId: agentCtx.agentId, beneficiaryUserId: agentCtx.ownerId, status: "offered", offeredAt: new Date(), bug: { tenantId: "tenant-zedu", beneficiaryUserId: "someone-else", claims: [], ...ownership } });
    db.reviewOffer.update.mockResolvedValue({ id: "offer-1", status: "accepted" });
    await expect(acceptReviewOffer(agentCtx, "offer-1")).rejects.toMatchObject({ status: 403 });
    expect(db.reviewOffer.update).not.toHaveBeenCalled();
  });

  it("accepts a pending review offer within TTL", async () => {
    const now = Date.now();
    db.reviewOffer.findUnique.mockResolvedValue({
      id: "offer-1",
      bugId: "bug-123",
      agentId: "agent-bob",
      beneficiaryUserId: "bob",
      status: "offered",
      offeredAt: new Date(now - 10_000), // 10s ago, well within 60s TTL
      pullRequestUrl: "https://github.com/zedu/web/pull/1",
      bug: { tenantId: "tenant-zedu" },
    });
    db.reviewOffer.update.mockResolvedValue({
      id: "offer-1",
      status: "accepted",
      acceptedAt: new Date(now),
      deadlineAt: new Date(now + REVIEW_DEADLINE_MS),
    });

    const result = await acceptReviewOffer(agentCtx, "offer-1");
    expect(result.offer.status).toBe("accepted");
    expect(db.reviewOffer.update).toHaveBeenCalledWith({
      where: { id: "offer-1" },
      data: expect.objectContaining({
        status: "accepted",
        deadlineAt: expect.any(Date),
      }),
    });
  });

  it("throws 410 when offer is expired", async () => {
    const now = Date.now();
    db.reviewOffer.findUnique.mockResolvedValue({
      id: "offer-1",
      bugId: "bug-123",
      agentId: "agent-bob",
      beneficiaryUserId: "bob",
      status: "offered",
      offeredAt: new Date(now - 70_000), // 70s ago (exceeded 60s TTL)
      pullRequestUrl: "https://github.com/zedu/web/pull/1",
      bug: { tenantId: "tenant-zedu" },
    });
    db.reviewOffer.update.mockResolvedValue({});

    await expect(acceptReviewOffer(agentCtx, "offer-1")).rejects.toThrowError(
      new IssueApiError(410, "This review offer expired."),
    );
    expect(db.reviewOffer.update).toHaveBeenCalledWith({
      where: { id: "offer-1" },
      data: expect.objectContaining({ status: "expired" }),
    });
  });

  it("rejects acceptance by a different agent with 409", async () => {
    db.reviewOffer.findUnique.mockResolvedValue({
      id: "offer-1",
      bugId: "bug-123",
      agentId: "agent-other",
      beneficiaryUserId: "other",
      status: "offered",
      offeredAt: new Date(),
      pullRequestUrl: "https://github.com/zedu/web/pull/1",
      bug: { tenantId: "tenant-zedu" },
    });

    await expect(acceptReviewOffer(agentCtx, "offer-1")).rejects.toThrowError(
      new IssueApiError(409, "This review offer was made to another agent."),
    );
  });
});

describe("expireReviewOffer moves to next eligible reviewer (#597)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
    db.issueClaim.groupBy.mockResolvedValue([]);
    db.reviewOffer.groupBy.mockResolvedValue([]);
    db.agentEvent.create.mockResolvedValue({ id: "evt-reoffer" });
    db.webhookSubscription.findMany.mockResolvedValue([]);
  });

  it("marks expired offer and offers to next eligible reviewer", async () => {
    const past = new Date(Date.now() - 100_000);
    db.reviewOffer.findUnique.mockResolvedValue({
      id: "offer-expired",
      bugId: "bug-123",
      status: "offered",
      offeredAt: past,
      deadlineAt: null,
      pullRequestUrl: "https://github.com/zedu/web/pull/1",
      headSha: "sha-abc",
    });
    db.reviewOffer.update.mockResolvedValue({});

    db.bug.findFirst.mockResolvedValue({
      id: "bug-123",
      tenantId: "tenant-zedu",
      projectId: "proj-1",
      title: "Bug",
      status: "open",
      pullRequestUrl: "https://github.com/zedu/web/pull/1",
      beneficiaryUserId: "alice",
      reporterId: "alice",
      createdByAgentId: null,
      createdByAgent: null,
      claims: [{ status: "active", releasedAt: null, agent: { ownerUserId: "alice" } }],
    });

    // Currently only Bob had an offer (which expired), so Dave is next
    db.reviewOffer.findMany.mockResolvedValue([
      { beneficiaryUserId: "bob", status: "expired", offeredAt: past, deadlineAt: null },
    ]);

    db.membership.findMany.mockResolvedValue([
      { userId: "bob", user: { agents: [{ id: "agent-bob" }] } },
      { userId: "dave", user: { agents: [{ id: "agent-dave" }] } },
    ]);

    db.reviewOffer.create.mockResolvedValue({
      id: "offer-dave",
      bugId: "bug-123",
      agentId: "agent-dave",
      beneficiaryUserId: "dave",
      status: "offered",
      offeredAt: new Date(),
    });

    const expired = await expireReviewOffer("offer-expired");
    expect(expired).toBe(true);

    // New offer created for next eligible reviewer (Dave)
    expect(db.reviewOffer.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bugId: "bug-123",
        agentId: "agent-dave",
        beneficiaryUserId: "dave",
      }),
    }));
    expect(db.agentEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "review.requested",
        payload: expect.objectContaining({
          agentId: "agent-dave",
          beneficiaryUserId: "dave",
        }),
      }),
    }));
  });
});

describe("handleTestVerdictSubmitted and review.completed (#597)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const prUrl = "https://github.com/zedu/web/pull/1";
  const bug = {
    id: "bug-1",
    tenantId: "tenant-zedu",
    projectId: "proj-1",
    title: "Bug 1",
    status: "open",
    pullRequestUrl: prUrl,
    beneficiaryUserId: "alice",
    reporterId: "alice",
    createdByAgentId: null,
    createdByAgent: null,
    claims: [{ status: "active", releasedAt: null, agentId: "solver-1", agent: { ownerUserId: "alice" } }],
  };

  it("marks reviewer offer completed and does not emit review.completed before threshold", async () => {
    db.bug.findFirst.mockResolvedValue(bug);
    db.reviewOffer.updateMany.mockResolvedValue({ count: 1 });
    // Only 1 good-to-merge verdict so far
    db.testVerdict.findMany.mockResolvedValue([
      { id: "tv-1", onBehalfOfUserId: "bob", agent: { id: "agent-bob", ownerUserId: "bob" } },
    ]);

    const result = await handleTestVerdictSubmitted(db as never, {
      bugId: "bug-1",
      agentId: "agent-bob",
      tenantId: "tenant-zedu",
      pullRequestUrl: prUrl,
    });

    expect(result.completed).toBe(false);
    expect(result.count).toBe(1);
    expect(db.agentEvent.create).not.toHaveBeenCalled();
  });

  it("publishes review.completed when 2 independent verdicts are met", async () => {
    db.bug.findFirst.mockResolvedValue(bug);
    db.reviewOffer.updateMany.mockResolvedValue({ count: 1 });
    db.agentEvent.findFirst.mockResolvedValue(null); // not already published
    db.agentEvent.create.mockResolvedValue({ id: "evt-review-completed" });
    db.webhookSubscription.findMany.mockResolvedValue([]);

    // 2 independent good-to-merge verdicts
    db.testVerdict.findMany.mockResolvedValue([
      { id: "tv-1", onBehalfOfUserId: "bob", agent: { id: "agent-bob", ownerUserId: "bob" } },
      { id: "tv-2", onBehalfOfUserId: "carol", agent: { id: "agent-carol", ownerUserId: "carol" } },
    ]);

    const result = await handleTestVerdictSubmitted(db as never, {
      bugId: "bug-1",
      agentId: "agent-carol",
      tenantId: "tenant-zedu",
      pullRequestUrl: prUrl,
    });

    expect(result.completed).toBe(true);
    expect(result.count).toBe(2);
    expect(db.agentEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        type: "review.completed",
        tenantId: "tenant-zedu",
        bugId: "bug-1",
        payload: expect.objectContaining({
          issueId: "bug-1",
          pullRequestUrl: prUrl,
          verdictCount: 2,
        }),
      }),
    }));
  });
  it("rejects acceptance when agent key is scoped to a different project (#608)", async () => {
    const reviewerAgent = {
      agentId: "agent-bob",
      name: "bob-agent",
      ownerId: "bob",
      tenantId: "tenant-zedu",
      level: "reviewer" as const,
    };
    db.reviewOffer.findUnique.mockResolvedValue({
      id: "offer-1",
      bugId: "bug-123",
      agentId: reviewerAgent.agentId,
      beneficiaryUserId: "bob",
      status: "offered",
      offeredAt: new Date(),
      pullRequestUrl: "https://github.com/zedu/web/pull/1",
      bug: { tenantId: "tenant-zedu", projectId: "proj-web" },
    });

    const { AgentProjectError } = await import("@/lib/agents/require-agent");
    await expect(
      acceptReviewOffer({ ...reviewerAgent, projectId: "proj-mobile", projectSlug: "mobile" }, "offer-1"),
    ).rejects.toBeInstanceOf(AgentProjectError);
  });
});
