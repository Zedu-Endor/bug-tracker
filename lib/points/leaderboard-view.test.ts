import { describe, expect, it } from "vitest";
import {
  filterLeaderboardRows,
  goalLabel,
  leaderboardPercent,
  solvedLabel,
  sortLeaderboardRows,
} from "./leaderboard-view";
import type { LeaderboardEntry } from "./leaderboard";

const row = (
  rank: number,
  name: string,
  points: number,
  solvedTasks: number,
): LeaderboardEntry => ({
  userId: `u${rank}`,
  name,
  image: null,
  points,
  solvedTasks,
  rank,
});

const rows = [
  row(1, "Ada Lovelace", 516, 3),
  row(2, "Bola Adeyemi", 396, 5),
  row(3, "Chi Nwosu", 342, 1),
];

describe("leaderboard view helpers", () => {
  it("filters names case-insensitively, ignoring surrounding spaces", () => {
    expect(filterLeaderboardRows(rows, "  BOLA ").map((r) => r.name)).toEqual(["Bola Adeyemi"]);
    expect(filterLeaderboardRows(rows, "lovelace").map((r) => r.rank)).toEqual([1]);
  });

  it("keeps the page as-is for a blank search", () => {
    expect(filterLeaderboardRows(rows, "   ").map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("returns an empty list when nobody matches", () => {
    expect(filterLeaderboardRows(rows, "zzz")).toEqual([]);
  });

  it("keeps the server's ranking when sorting by points", () => {
    expect(sortLeaderboardRows(rows, "points").map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("sorts by solved tasks without rewriting ranks", () => {
    expect(sortLeaderboardRows(rows, "solved").map((r) => r.rank)).toEqual([2, 1, 3]);
  });

  it("breaks solved ties on points, then rank", () => {
    const tied = [row(2, "B", 90, 4), row(1, "A", 120, 4), row(3, "C", 90, 4)];
    expect(sortLeaderboardRows(tied, "solved").map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("clamps progress to 0–100", () => {
    expect(leaderboardPercent(0, 500)).toBe(0);
    expect(leaderboardPercent(250, 500)).toBe(50);
    expect(leaderboardPercent(900, 500)).toBe(100);
    expect(leaderboardPercent(100, 0)).toBe(0);
    expect(leaderboardPercent(Number.NaN, 500)).toBe(0);
  });

  it("describes how far the goal still is, then how far past it", () => {
    expect(goalLabel(0, 500)).toBe("500 pts to goal");
    expect(goalLabel(494, 500)).toBe("6 pts to goal");
    expect(goalLabel(500, 500)).toBe("Goal reached");
    expect(goalLabel(516, 500)).toBe("Goal reached · +16");
  });

  it("pluralises solved issues", () => {
    expect(solvedLabel(0)).toBe("0 issues solved");
    expect(solvedLabel(1)).toBe("1 issue solved");
    expect(solvedLabel(3)).toBe("3 issues solved");
  });
});
