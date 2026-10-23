"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import {
  filterLeaderboardRows,
  leaderboardPercent,
  sortLeaderboardRows,
  type LeaderboardSort,
} from "@/lib/points/leaderboard-view";
import type { LeaderboardEntry } from "@/lib/points/leaderboard";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** The medal colours the design uses for ranks 1–3. */
const rankTone = ["text-[#E0A100]", "text-[#94A3B8]", "text-[#C2703D]"];

const sortOptions: { id: LeaderboardSort; label: string }[] = [
  { id: "points", label: "Points" },
  { id: "solved", label: "Solved" },
];

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[15px] w-[15px] shrink-0 text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/**
 * The Rankings card's search + Points/Solved toggle.
 *
 * Search and sorting are client-side over the page the server sent: the URL
 * keeps the page number, so deep links and Previous/Next stay authoritative.
 * A row's rank always remains its all-time points rank, as on the mockup.
 */
export function LeaderboardTable({
  rows,
  viewerId,
  total,
  targetPoints,
  footer,
}: {
  rows: LeaderboardEntry[];
  viewerId: string;
  total: number;
  targetPoints: number;
  /** Server-rendered pagination, so page links stay real URLs. */
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<LeaderboardSort>("points");

  const visible = useMemo(
    () => sortLeaderboardRows(filterLeaderboardRows(rows, query), sort),
    [rows, query, sort],
  );

  const searching = query.trim().length > 0;
  const countLabel = searching
    ? `${visible.length} of ${total} ${total === 1 ? "person" : "people"}`
    : `${total} ${total === 1 ? "person" : "people"}`;

  return (
    <section
      aria-label="Rankings"
      className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <h2 className="text-lg font-bold text-ink">Rankings</h2>
          <span className="text-[13px] text-muted" aria-live="polite">
            {countLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-10 w-full max-w-[240px] items-center gap-2 rounded-full border border-line bg-surface px-3.5">
            <SearchIcon />
            <span className="sr-only">Search people</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people"
              className={`min-w-0 flex-1 border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted ${focusRing}`}
            />
          </label>

          <div
            role="group"
            aria-label="Sort by"
            className="flex gap-0.5 rounded-full bg-seg p-1"
          >
            {sortOptions.map((option) => {
              const active = sort === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSort(option.id)}
                  className={`min-h-8 rounded-full px-3.5 text-[13px] transition-colors ${focusRing} ${
                    active
                      ? "bg-surface font-bold text-ink shadow-[0_1px_3px_rgba(21,18,31,0.12)]"
                      : "font-medium text-ink-2 hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="flex items-center gap-4 rounded-full bg-tint px-4 py-3.5 text-xs font-bold uppercase tracking-[0.05em] text-accent">
            <span className="w-10">#</span>
            <span className="min-w-0 flex-1">Person</span>
            <span className="w-[260px]">Progress to {targetPoints}</span>
            <span className="w-[90px] text-right">Solved</span>
            <span className="w-[100px] text-right">Points</span>
          </div>

          {visible.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-muted">
              No one on this page matches “{query.trim()}”.
            </p>
          ) : (
            <ul>
              {visible.map((entry, index) => {
                const you = entry.userId === viewerId;
                const percent = leaderboardPercent(entry.points, targetPoints);
                const met = entry.points >= targetPoints;
                const last = index === visible.length - 1;
                return (
                  <li
                    key={entry.userId}
                    className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-row-sel ${
                      last ? "" : "border-b border-divider"
                    } ${you ? "bg-row-sel shadow-[inset_3px_0_0_#2e6fef]" : ""}`}
                  >
                    <span
                      className={`w-10 text-sm font-extrabold ${
                        entry.rank <= 3 ? rankTone[entry.rank - 1] : "text-muted"
                      }`}
                    >
                      {entry.rank}
                    </span>

                    <span className="flex min-w-0 flex-1 items-center gap-3">
                      <Link
                        href={`/users/${entry.userId}`}
                        className={`flex min-w-0 items-center gap-3 rounded-md ${focusRing}`}
                      >
                        <Avatar name={entry.name} image={entry.image} size="lg" />
                        <span className="truncate text-[15px] font-semibold text-ink">
                          {entry.name}
                        </span>
                      </Link>
                      {you ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold text-white">
                          You
                        </span>
                      ) : null}
                    </span>

                    <span className="flex w-[260px] items-center gap-2.5">
                      <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-tint">
                        <span
                          className={`block h-full rounded-full ${
                            met ? "bg-primary" : "bg-sky-tint"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </span>
                      <span className="w-10 text-right text-xs font-bold text-ink-2">
                        {percent}%
                      </span>
                    </span>

                    <span className="w-[90px] text-right text-sm text-ink-2">
                      {entry.solvedTasks}
                    </span>

                    <span className="w-[100px] text-right text-[15px] font-extrabold text-ink">
                      {entry.points}{" "}
                      <span className="text-xs font-semibold text-muted">pts</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {footer ? <div className="border-t border-divider pt-3.5">{footer}</div> : null}
    </section>
  );
}
