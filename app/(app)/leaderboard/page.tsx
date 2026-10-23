import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { LeaderboardTable } from "@/components/leaderboard-table";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import {
  DEFAULT_LEADERBOARD_LIMIT,
  paginatedTenantLeaderboard,
  pointTotals,
  tenantRankFor,
  type LeaderboardEntry,
} from "@/lib/points/leaderboard";
import {
  goalLabel,
  leaderboardPercent,
  solvedLabel,
} from "@/lib/points/leaderboard-view";
import { getPlatformRewardConfig } from "@/lib/points/platform-rewards";

export const metadata = { title: "Leaderboard" };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const paginationLink = `inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-line bg-surface px-3 text-xs font-bold text-ink transition-colors hover:bg-tint ${focusRing}`;
const paginationDisabled =
  "inline-flex h-9 min-w-9 cursor-not-allowed items-center justify-center rounded-full border border-line bg-chip px-3 text-xs font-bold text-muted";

/** One shape for every leaderboard link, so the redirect and Previous/Next agree. */
function leaderboardHref(page: number, limit: number): string {
  return `/leaderboard?page=${page}&limit=${limit}`;
}

/** The three medal tints from the design, in rank order. */
const podiumTone = [
  { medal: "bg-[rgba(224,161,0,0.16)] text-[#E0A100]", ring: "#E0A100" },
  { medal: "bg-[rgba(148,163,184,0.18)] text-[#94A3B8]", ring: "#94A3B8" },
  { medal: "bg-[rgba(194,112,61,0.16)] text-[#C2703D]", ring: "#C2703D" },
];

function TrophyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[18px] w-[18px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8" />
      <path d="M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  );
}

/** A top-three card: medal, avatar with a rank-coloured ring, points and progress. */
function PodiumCard({
  entry,
  place,
  targetPoints,
}: {
  entry: LeaderboardEntry;
  place: number;
  targetPoints: number;
}) {
  const tone = podiumTone[place] ?? podiumTone[2];
  const percent = leaderboardPercent(entry.points, targetPoints);
  const met = entry.points >= targetPoints;

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-5">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.medal}`}
        >
          <TrophyIcon />
        </span>
        <span className="text-[13px] font-extrabold text-muted">#{entry.rank}</span>
      </div>

      <div className="flex items-center gap-3">
        <span
          className="shrink-0 rounded-full"
          style={{ boxShadow: `0 0 0 3px var(--surface), 0 0 0 5px ${tone.ring}` }}
        >
          <Avatar name={entry.name} image={entry.image} size="xl" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-base font-bold text-ink">{entry.name}</span>
          <span className="text-[13px] text-muted">{entry.solvedTasks} solved</span>
        </div>
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-[32px] font-extrabold leading-none text-ink">
          {entry.points}
        </span>
        <span className="text-sm font-semibold text-muted">pts</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-tint">
          <div
            className={`h-full rounded-full ${met ? "bg-primary" : "bg-sky-tint"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span
          className={`text-xs font-bold ${met ? "text-ok-fg" : "text-muted"}`}
        >
          {goalLabel(entry.points, targetPoints)}
        </span>
      </div>
    </div>
  );
}

/** The navy card: the viewer's rank, balance and distance to the goal. */
function YourStanding({
  rank,
  total,
  points,
  solvedTasks,
  targetPoints,
  next,
}: {
  rank: number | null;
  total: number;
  points: number;
  solvedTasks: number;
  targetPoints: number;
  next: LeaderboardEntry | null;
}) {
  const percent = leaderboardPercent(points, targetPoints);
  const met = points >= targetPoints;
  const ahead =
    rank === 1 && next ? `${Math.max(0, points - next.points)} pts ahead of #2` : null;

  return (
    <div className="relative flex min-w-0 flex-[1_1_300px] flex-col gap-4 overflow-hidden rounded-[20px] bg-deep-ocean p-[22px] text-white">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-[90px] -top-[90px] h-60 w-60 rounded-full bg-[radial-gradient(circle,rgba(57,120,246,0.45),rgba(57,120,246,0)_70%)]"
      />

      <span className="relative text-xs font-bold uppercase tracking-[0.08em] text-sidebar-muted">
        Your standing
      </span>

      <div className="relative flex flex-wrap items-baseline gap-2.5">
        <span className="text-[44px] font-extrabold leading-none">
          {rank === null ? "Unranked" : `#${rank}`}
        </span>
        <span className="text-sm text-sidebar-ink">
          of {total} {total === 1 ? "person" : "people"}
        </span>
      </div>

      <div className="relative flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <span className="text-sidebar-ink">
            {points} / {targetPoints} pts
          </span>
          {met ? (
            <span className="rounded-full bg-ok-bg px-2 py-0.5 font-bold text-ok-fg">
              {goalLabel(points, targetPoints)}
            </span>
          ) : (
            <span className="text-sidebar-muted">
              {goalLabel(points, targetPoints)}
            </span>
          )}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-blue-slate">
          <div
            className="h-full rounded-full bg-electric-blue"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <span className="relative text-[13px] text-sidebar-ink">
        {ahead ? `${ahead} · ${solvedLabel(solvedTasks)}` : solvedLabel(solvedTasks)}
      </span>
    </div>
  );
}

/** Members of the current tenant ranked by points (#428, #657). */
export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string; limit?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(
      10,
      parseInt(params.limit ?? String(DEFAULT_LEADERBOARD_LIMIT), 10) ||
        DEFAULT_LEADERBOARD_LIMIT,
    ),
  );

  const user = await requireUser();
  const tenantId = await currentTenantIdFor(user.id);
  const targetPoints = (await getPlatformRewardConfig(prisma)).target;
  const { entries: rows, total, totalPages } = tenantId
    ? await paginatedTenantLeaderboard(prisma, tenantId, { page, limit })
    : { entries: [], total: 0, totalPages: 0 };

  // A page past the end (an old link, a hand-edited URL) would otherwise show
  // "No points yet" on a leaderboard that has points. Send it to the last page.
  if (total > 0 && page > totalPages) redirect(leaderboardHref(totalPages, limit));

  const startIdx = total === 0 ? 0 : (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, total);

  // The podium is always the overall top three, even while paging through the
  // table. Page one with a normal page size already contains them.
  let podium = rows.slice(0, 3);
  if (tenantId && (page > 1 || limit < 3)) {
    try {
      podium = (
        await paginatedTenantLeaderboard(prisma, tenantId, { page: 1, limit: 3 })
      ).entries;
    } catch (error) {
      console.error("[leaderboard] podium failed", error);
    }
  }

  // The layout has already read these for the header, but there is no server
  // context to hand them down, so the page reads its own copy.
  let viewerPoints = 0;
  let viewerSolved = 0;
  let viewerPlace: { rank: number; total: number } | null = null;
  if (tenantId) {
    try {
      const totals = await pointTotals(prisma, tenantId, user.id);
      viewerPoints = totals.points;
      viewerSolved = totals.solvedTasks;
    } catch (error) {
      console.error("[leaderboard] points failed", error);
    }
    try {
      viewerPlace = await tenantRankFor(prisma, tenantId, user.id);
    } catch (error) {
      console.error("[leaderboard] rank failed", error);
    }
  }

  const viewerRank = viewerPlace?.rank ?? null;
  const peopleTotal = viewerPlace?.total ?? total;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[640px] flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Leaderboard
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Points for solving, reporting and reviewing issues. The goal is{" "}
            {targetPoints} points.
          </p>
        </div>
        <Link
          href="/points/disputes"
          className={`inline-flex h-[42px] items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-bold text-ink transition-colors hover:bg-tint ${focusRing}`}
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m16 16 3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM2 16l3-8 3 8c-.9.7-1.9 1-3 1s-2.1-.3-3-1zM7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
          </svg>
          Disputes
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-[20px] border border-line bg-surface p-6">
          <p className="font-bold text-ink">No points yet</p>
          <p className="text-sm text-muted">
            Resolve an assigned issue to earn the first ones.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-stretch gap-4">
            <div className="grid min-w-0 flex-[999_1_640px] grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
              {podium.map((entry, index) => (
                <PodiumCard
                  key={entry.userId}
                  entry={entry}
                  place={index}
                  targetPoints={targetPoints}
                />
              ))}
            </div>
            <YourStanding
              rank={viewerRank}
              total={peopleTotal}
              points={viewerPoints}
              solvedTasks={viewerSolved}
              targetPoints={targetPoints}
              next={podium[1] ?? null}
            />
          </div>

          <LeaderboardTable
            rows={rows}
            viewerId={user.id}
            total={total}
            targetPoints={targetPoints}
            footer={
              totalPages > 1 ? (
                <nav
                  aria-label="Pagination"
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="text-[13px] text-muted">
                    Showing {startIdx}–{endIdx} of {total}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {page > 1 ? (
                      <Link
                        href={leaderboardHref(page - 1, limit)}
                        className={paginationLink}
                      >
                        Previous
                      </Link>
                    ) : (
                      <span aria-disabled="true" className={paginationDisabled}>
                        Previous
                      </span>
                    )}
                    <span className="px-1.5 text-xs font-bold text-ink">
                      Page {page} of {totalPages}
                    </span>
                    {page < totalPages ? (
                      <Link
                        href={leaderboardHref(page + 1, limit)}
                        className={paginationLink}
                      >
                        Next
                      </Link>
                    ) : (
                      <span aria-disabled="true" className={paginationDisabled}>
                        Next
                      </span>
                    )}
                  </div>
                </nav>
              ) : null
            }
          />
        </>
      )}
    </div>
  );
}
