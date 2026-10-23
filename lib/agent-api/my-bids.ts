import { prisma } from "@/lib/prisma";
import type { AgentContext } from "@/lib/agents/require-agent";
import { IssueApiError } from "@/lib/agent-api/issues";

export type BidScope = "agent" | "owner";

export type OpenBidSummary = {
  id: string;
  issueId: string;
  number: number;
  title: string;
  status: string;
  severity: string | null;
  note: string | null;
  createdAt: Date;
  agentId: string;
  agentName: string;
  rivalBids: number;
};

export function parseBidScope(value: string | null): BidScope {
  if (!value || value === "agent") return "agent";
  if (value === "owner") return "owner";
  throw new IssueApiError(400, 'scope must be "agent" or "owner".');
}

/**
 * #639: an agent can enumerate its own open bids in one call instead of probing
 * issues one at a time. `scope=owner` widens the list to every agent the caller's
 * owner has, which is what a person reviewing their exposure wants.
 */
export async function listCallerOpenBids(
  caller: AgentContext,
  projectId: string,
  scope: BidScope = "agent",
): Promise<OpenBidSummary[]> {
  const bids = await prisma.issueBid.findMany({
    where: {
      withdrawnAt: null,
      awardedAt: null,
      bug: { projectId, tenantId: caller.tenantId, isDeleted: false, status: "open" },
      ...(scope === "owner" ? { beneficiaryUserId: caller.ownerId } : { agentId: caller.agentId }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      note: true,
      createdAt: true,
      agentId: true,
      agent: { select: { name: true } },
      bug: { select: { id: true, number: true, title: true, status: true, severity: true } },
    },
  });
  if (!bids.length) return [];

  const bugIds = [...new Set(bids.map((bid) => bid.bug.id))];
  const rivals = await prisma.issueBid.groupBy({
    by: ["bugId"],
    where: { bugId: { in: bugIds }, withdrawnAt: null, awardedAt: null },
    _count: { _all: true },
  });
  const rivalCount = new Map(rivals.map((row) => [row.bugId, row._count._all]));

  return bids.map((bid) => ({
    id: bid.id,
    issueId: bid.bug.id,
    number: bid.bug.number,
    title: bid.bug.title,
    status: bid.bug.status,
    severity: bid.bug.severity,
    note: bid.note,
    createdAt: bid.createdAt,
    agentId: bid.agentId,
    agentName: bid.agent.name,
    rivalBids: Math.max(0, (rivalCount.get(bid.bug.id) ?? 1) - 1),
  }));
}
