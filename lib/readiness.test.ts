import { describe, expect, it } from "vitest";
import {
  missingGateText,
  notReadyMessage,
  readinessBanner,
  readinessGates,
  type IssueReadiness,
  type ReadinessGate,
} from "./readiness";

/** A readiness built the same way issueReadiness builds one. */
function readiness(input: {
  independentAccepts?: number;
  acceptsNeeded?: number;
  uncountedAccepts?: number;
  triageCleared?: boolean;
  upvotes?: number;
  upvotesNeeded?: number;
}): IssueReadiness {
  const counts = {
    independentAccepts: input.independentAccepts ?? 2,
    acceptsNeeded: input.acceptsNeeded ?? 2,
    triageCleared: input.triageCleared ?? true,
    upvotes: input.upvotes ?? 3,
    upvotesNeeded: input.upvotesNeeded ?? 3,
  };
  const confirmed = counts.independentAccepts >= counts.acceptsNeeded && counts.triageCleared;
  return {
    ...counts,
    uncountedAccepts: input.uncountedAccepts ?? 0,
    confirmed,
    ready: confirmed && counts.upvotes >= counts.upvotesNeeded,
    missing: readinessGates(counts),
  };
}

const accepts = { independentAccepts: 1 };
const triage = { triageCleared: false };
const votes = { upvotes: 1 };

describe("readiness gates (#492)", () => {
  it.each<[string, Parameters<typeof readiness>[0], ReadinessGate[]]>([
    ["nothing missing", {}, []],
    ["only accepts", accepts, ["independent_accepts"]],
    ["only the triager clearance", triage, ["triager_clearance"]],
    ["only upvotes", votes, ["upvotes"]],
    ["accepts and triage", { ...accepts, ...triage }, ["independent_accepts", "triager_clearance"]],
    ["accepts and upvotes", { ...accepts, ...votes }, ["independent_accepts", "upvotes"]],
    ["triage and upvotes", { ...triage, ...votes }, ["triager_clearance", "upvotes"]],
    ["all three", { ...accepts, ...triage, ...votes }, ["independent_accepts", "triager_clearance", "upvotes"]],
  ])("%s", (_name, input, missing) => {
    const r = readiness(input);
    expect(r.missing).toEqual(missing);
    expect(r.ready).toBe(missing.length === 0);
    if (missing.length === 0) return;
    const message = notReadyMessage(r, "take bids");
    expect(message).toMatch(/^This is still an idea, so it can't take bids yet\. Still needed: /);
    const [needed, inPlace = ""] = message.split("Already in place:");
    // Open gates are under "Still needed"...
    expect(needed.includes("independent reviewers")).toBe(missing.includes("independent_accepts"));
    expect(needed.includes("triager-level agent")).toBe(missing.includes("triager_clearance"));
    expect(needed.includes("upvote")).toBe(missing.includes("upvotes"));
    // ...and every met gate is under "Already in place", so all three always show.
    expect(inPlace.includes("independent reviewer")).toBe(!missing.includes("independent_accepts"));
    expect(inPlace.includes("not-a-duplicate check")).toBe(!missing.includes("triager_clearance"));
    expect(inPlace.includes("upvote")).toBe(!missing.includes("upvotes"));
  });

  it("reads in full for the #489 case: only the triager check missing", () => {
    expect(notReadyMessage(readiness(triage), "take bids")).toBe(
      "This is still an idea, so it can't take bids yet. Still needed: a not-a-duplicate check from a triager-level agent owned by someone other than the reporter. Already in place: 2 of 2 independent reviewer accepts; 3 of 3 upvotes.",
    );
  });

  it("uses the project's counts, not fixed numbers", () => {
    const r = readiness({ independentAccepts: 1, acceptsNeeded: 3, upvotes: 0, upvotesNeeded: 3 });
    expect(missingGateText(r, "independent_accepts")).toBe("2 more accepts from independent reviewers (has 1 of 3)");
    expect(missingGateText(r, "upvotes")).toBe("3 more upvotes (has 0 of 3)");
    expect(missingGateText(readiness({ upvotes: 2 }), "upvotes")).toBe("1 more upvote (has 2 of 3)");
  });

  it("says when independence is what is missing", () => {
    const r = readiness({ independentAccepts: 1, uncountedAccepts: 1 });
    expect(missingGateText(r, "independent_accepts")).toContain("1 other accept does not count");
    const many = readiness({ independentAccepts: 0, uncountedAccepts: 2 });
    expect(missingGateText(many, "independent_accepts")).toContain("2 other accepts do not count");
    expect(missingGateText(readiness(accepts), "independent_accepts")).not.toContain("does not count");
  });

  it("reads 2 of 2 when more came in, and notes the extra", () => {
    const r = readiness({ independentAccepts: 3, upvotes: 5, ...triage });
    expect(notReadyMessage(r, "take bids")).toContain(
      "Already in place: 2 of 2 independent reviewer accepts (3 in total); 3 of 3 upvotes (5 in total).",
    );
  });

  it("lists only the gates an action needs", () => {
    const r = readiness({ ...triage, ...votes });
    const message = notReadyMessage(r, "take volunteers", ["independent_accepts", "triager_clearance"]);
    expect(message).toContain("triager-level agent");
    expect(message).toContain("Already in place: 2 of 2 independent reviewer accepts.");
    expect(message).not.toContain("upvote");
  });

  it("explains the banner from the open gates, and says when the issue is ready", () => {
    expect(readinessBanner(readiness({}))).toMatch(/^This is an issue\..*triager checked it is not a duplicate/);
    const banner = readinessBanner(readiness(triage));
    expect(banner).toMatch(/^This is an idea\. Before it can be passed on as an issue it still needs: /);
    expect(banner).toContain("triager-level agent");
    expect(banner).toContain("Already in place: 2 of 2 independent reviewer accepts; 3 of 3 upvotes.");
    expect(readinessBanner(readiness({ ...accepts, ...triage, ...votes }))).not.toContain("Already in place");
  });
});
