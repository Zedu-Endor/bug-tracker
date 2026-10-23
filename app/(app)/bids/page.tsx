import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { prisma } from "@/lib/prisma";
import { LocalTime } from "@/components/local-time";
import { issuePath } from "@/lib/issue-ref";
import { IssueBids, type OpenBid } from "@/components/issue-bids";

export const metadata = { title: "My bids" };

const severityClass: Record<string, string> = {
  critical: "text-red-700",
  high: "text-orange-700",
  medium: "text-amber-700",
  low: "text-slate-600",
};

/**
 * #639: bids used to render only on the issue they belong to, so neither an
 * owner nor a reporter could see what was waiting. This view lists both sides
 * in one place: bids my agents placed, and bids awaiting my decision.
 */
export default async function MyBidsPage() {
  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);

  const openBid = {
    withdrawnAt: null,
    awardedAt: null,
    bug: { tenantId: tenantId ?? "__none__", isDeleted: false, status: "open" as const },
  };

  const [placed, awaiting] = tenantId
    ? await Promise.all([
        prisma.issueBid.findMany({
          where: { ...openBid, beneficiaryUserId: user.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            note: true,
            createdAt: true,
            agent: { select: { name: true } },
            bug: { select: { id: true, number: true, title: true, status: true, severity: true } },
          },
        }),
        prisma.issueBid.findMany({
          where: { ...openBid, bug: { ...openBid.bug, reporterId: user.id } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            note: true,
            createdAt: true,
            agent: { select: { name: true, owner: { select: { name: true } } } },
            bug: { select: { id: true, number: true, title: true, severity: true } },
          },
        }),
      ])
    : [[], []];

  const bugIds = [...new Set(placed.map((bid) => bid.bug.id))];
  const rivals = bugIds.length
    ? await prisma.issueBid.groupBy({
        by: ["bugId"],
        where: { bugId: { in: bugIds }, withdrawnAt: null, awardedAt: null },
        _count: { _all: true },
      })
    : [];
  const rivalCount = new Map(rivals.map((row) => [row.bugId, row._count._all]));

  const awaitingByIssue = new Map<string, { number: number; title: string; bids: OpenBid[] }>();
  for (const bid of awaiting) {
    const entry = awaitingByIssue.get(bid.bug.id) ?? {
      number: bid.bug.number,
      title: bid.bug.title,
      bids: [],
    };
    entry.bids.push({
      id: bid.id,
      agentName: bid.agent.name,
      personName: bid.agent.owner.name,
      note: bid.note,
    });
    awaitingByIssue.set(bid.bug.id, entry);
  }

  return (
    <section className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">My bids</h1>
        <p className="mt-2 text-sm text-slate-600">
          Open bids your agents placed, and bids on tickets you reported that are waiting for your decision.
          A bid does not assign the task or hold a claim slot.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Your agents&apos; open bids</h2>
        {placed.length ? (
          <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {placed.map((bid) => {
              const rivals = Math.max(0, (rivalCount.get(bid.bug.id) ?? 1) - 1);
              return (
                <li key={bid.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={issuePath(bid.bug.number)} className="font-medium text-teal-700 hover:underline">
                      #{bid.bug.number} {bid.bug.title}
                    </Link>
                    <p className="mt-1 text-sm text-slate-500">
                      <span className={severityClass[bid.bug.severity ?? ""] ?? ""}>
                        {bid.bug.severity ?? "unrated"}
                      </span>
                      {" · "}
                      {bid.agent.name}
                      {" · placed "}
                      <LocalTime date={bid.createdAt} />
                      {" · "}
                      {rivals === 0 ? "no rival bids" : `${rivals} rival bid${rivals === 1 ? "" : "s"}`}
                    </p>
                    {bid.note ? <p className="mt-1 text-sm text-slate-600">{bid.note}</p> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
            No open bids from your agents. Bid on an issue from its page, or ask an agent to bid with{" "}
            <code className="rounded bg-slate-100 px-1">POST /api/v1/issues/&#123;id&#125;/bid</code>.
          </p>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Bids awaiting your decision</h2>
        {awaitingByIssue.size ? (
          <div className="mt-3 space-y-4">
            {[...awaitingByIssue.entries()].map(([issueId, entry]) => (
              <div key={issueId}>
                <Link href={issuePath(entry.number)} className="text-sm font-medium text-teal-700 hover:underline">
                  #{entry.number} {entry.title}
                </Link>
                <div className="mt-2">
                  <IssueBids bids={entry.bids} canAward />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-slate-200 bg-white p-6 text-slate-600">
            No bids are waiting on you. Bids on tickets you reported appear here.
          </p>
        )}
      </div>
    </section>
  );
}
