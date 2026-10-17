import { describe, expect, it } from "vitest";
import {
  calculateVoteChange,
  isValidVoteDirection,
  reconcileVoteCount,
} from "./voting";

describe("isValidVoteDirection", () => {
  it("accepts like (1) and dislike (-1)", () => {
    expect(isValidVoteDirection(1)).toBe(true);
    expect(isValidVoteDirection(-1)).toBe(true);
  });

  it("rejects out-of-range or malformed directions", () => {
    for (const bad of [100, -2, 0, 2, 1.5, "1", "-1", null, undefined, NaN]) {
      expect(isValidVoteDirection(bad)).toBe(false);
    }
  });
});

describe("calculateVoteChange", () => {
  it("upvotes from neutral (0 -> +1)", () => {
    expect(calculateVoteChange(0, 1)).toEqual({
      nextVote: 1,
      countDelta: 1,
    });
    expect(calculateVoteChange(null, 1)).toEqual({
      nextVote: 1,
      countDelta: 1,
    });
    expect(calculateVoteChange(undefined, 1)).toEqual({
      nextVote: 1,
      countDelta: 1,
    });
  });

  it("downvotes from neutral (0 -> -1)", () => {
    expect(calculateVoteChange(0, -1)).toEqual({
      nextVote: -1,
      countDelta: -1,
    });
  });

  it("toggles off upvote (+1 -> 0)", () => {
    expect(calculateVoteChange(1, 1)).toEqual({
      nextVote: 0,
      countDelta: -1,
    });
  });

  it("toggles off downvote (-1 -> 0)", () => {
    expect(calculateVoteChange(-1, -1)).toEqual({
      nextVote: 0,
      countDelta: 1,
    });
  });

  it("switches from upvote to downvote (+1 -> -1)", () => {
    expect(calculateVoteChange(1, -1)).toEqual({
      nextVote: -1,
      countDelta: -2,
    });
  });

  it("switches from downvote to upvote (-1 -> +1)", () => {
    expect(calculateVoteChange(-1, 1)).toEqual({
      nextVote: 1,
      countDelta: 2,
    });
  });
});

describe("reconcileVoteCount (#362)", () => {
  it("calculates accurate voteCount from like and dislike counts", () => {
    expect(reconcileVoteCount(5, 2)).toBe(3);
    expect(reconcileVoteCount(0, 3)).toBe(-3);
    expect(reconcileVoteCount(4, 4)).toBe(0);
    expect(reconcileVoteCount(0, 0)).toBe(0);
    expect(reconcileVoteCount(100, 0)).toBe(100);
  });

  it("ensures toggleVoteAction in app/actions/bugs.ts reconciles count from Vote rows (#362)", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("app/actions/bugs.ts", "utf8");

    // Guard: relative increment must not be used to prevent race-condition counter drift
    expect(source).not.toContain('"voteCount" + ${countDelta}');
    expect(source).not.toContain("{ increment: countDelta }");

    // Guard: authoritative count must be computed from groupBy and written directly to Bug
    expect(source).toContain("const voteCount = reconcileVoteCount(likeCount, dislikeCount)");
    expect(source).toContain("await tx.bug.update({");
    expect(source).toContain("data: { voteCount }");

    // Guard: serialize vote changes using row-level locking
    expect(source).toContain('SELECT id FROM "Bug" WHERE id = ${bugId} FOR UPDATE');
  });
});
