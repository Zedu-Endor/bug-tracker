import type { LeaderboardEntry } from "@/lib/points/leaderboard";

/**
 * Presentation helpers for the leaderboard screen.
 *
 * The server still decides the page and the ranking. These helpers only
 * shape what that page shows: the search box, the Points/Solved toggle and
 * the progress copy. Ranks stay the points-based ranks the server sent, so
 * re-sorting a page never invents a new standing.
 */

export type LeaderboardSort = "points" | "solved";

/** Case-insensitive name search. A blank query keeps every row. */
export function filterLeaderboardRows(
  rows: readonly LeaderboardEntry[],
  query: string,
): LeaderboardEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) => row.name.toLowerCase().includes(needle));
}

/** Re-order the current page; "points" keeps the server's rank order. */
export function sortLeaderboardRows(
  rows: readonly LeaderboardEntry[],
  sort: LeaderboardSort,
): LeaderboardEntry[] {
  if (sort === "points") return [...rows];
  return [...rows].sort(
    (a, b) =>
      b.solvedTasks - a.solvedTasks ||
      b.points - a.points ||
      a.rank - b.rank ||
      a.name.localeCompare(b.name),
  );
}

/** Progress towards the weekly goal, clamped to 0–100. */
export function leaderboardPercent(points: number, target: number): number {
  if (!Number.isFinite(points) || points <= 0) return 0;
  if (!Number.isFinite(target) || target <= 0) return 0;
  return Math.min(100, Math.round((points / target) * 100));
}

/** "6 pts to goal" until the target is met, then "Goal reached · +6". */
export function goalLabel(points: number, target: number): string {
  if (points >= target) {
    const extra = points - target;
    return extra > 0 ? `Goal reached · +${extra}` : "Goal reached";
  }
  return `${target - points} pts to goal`;
}

/** "3 issues solved" / "1 issue solved". */
export function solvedLabel(solvedTasks: number): string {
  return `${solvedTasks} ${solvedTasks === 1 ? "issue" : "issues"} solved`;
}
