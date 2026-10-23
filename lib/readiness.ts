/**
 * Why an open issue can or cannot be passed on yet (#492).
 *
 * The three gates come from the same checks that enforce them
 * (`issueReadiness` in lib/agent-api/validation.ts): independent reviewer
 * accepts, a triager's not-a-duplicate clearance, and upvotes. Every refusal
 * and the issue-page banner are written from this, so they name exactly the
 * gate that is still open instead of a fixed sentence.
 */

export type ReadinessGate = "independent_accepts" | "triager_clearance" | "upvotes";

/** Counts only: nothing here says who reviewed, beyond what `validations` already shows. */
export type IssueReadiness = {
  /** Accepts of kind `real` that count: one per independent owner, standing, since the last edit. */
  independentAccepts: number;
  /** The project's `confirmationsNeeded`. */
  acceptsNeeded: number;
  /** Standing accepts that do not count toward independence (the reporter's side, the worker's side, or a second accept from the same owner). */
  uncountedAccepts: number;
  /** A triager from someone other than the reporter cleared it as not a duplicate since the last edit. */
  triageCleared: boolean;
  upvotes: number;
  upvotesNeeded: number;
  /** Independent accepts and triager clearance are both in place. */
  confirmed: boolean;
  /** Confirmed and enough upvotes: it can be bid on, awarded and offered. */
  ready: boolean;
  /** The gates still open, in the order they are usually passed. */
  missing: ReadinessGate[];
};

export function readinessGates(input: {
  independentAccepts: number;
  acceptsNeeded: number;
  triageCleared: boolean;
  upvotes: number;
  upvotesNeeded: number;
}): ReadinessGate[] {
  const missing: ReadinessGate[] = [];
  if (input.independentAccepts < input.acceptsNeeded) missing.push("independent_accepts");
  if (!input.triageCleared) missing.push("triager_clearance");
  if (input.upvotes < input.upvotesNeeded) missing.push("upvotes");
  return missing;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/** One open gate, in plain words. */
export function missingGateText(readiness: IssueReadiness, gate: ReadinessGate): string {
  if (gate === "independent_accepts") {
    const left = readiness.acceptsNeeded - readiness.independentAccepts;
    const base = `${left} more ${plural(left, "accept", "accepts")} from independent reviewers (has ${readiness.independentAccepts} of ${readiness.acceptsNeeded})`;
    if (readiness.uncountedAccepts === 0) return base;
    const n = readiness.uncountedAccepts;
    return `${base}; ${n} other ${plural(n, "accept does", "accepts do")} not count because ${plural(n, "it comes", "they come")} from the reporter's side, the person working on it, or someone who already accepted`;
  }
  if (gate === "triager_clearance") {
    return "a not-a-duplicate check from a triager-level agent owned by someone other than the reporter";
  }
  const left = readiness.upvotesNeeded - readiness.upvotes;
  return `${left} more ${plural(left, "upvote", "upvotes")} (has ${readiness.upvotes} of ${readiness.upvotesNeeded})`;
}

const ALL_GATES: readonly ReadinessGate[] = ["independent_accepts", "triager_clearance", "upvotes"];

/**
 * A gate that is already met, in plain words, so every message shows all of
 * them. Reads "2 of 2" even when more came in; any extra is noted after it.
 */
export function metGateText(readiness: IssueReadiness, gate: ReadinessGate): string {
  if (gate === "independent_accepts") {
    const needed = readiness.acceptsNeeded;
    const extra = readiness.independentAccepts > needed ? ` (${readiness.independentAccepts} in total)` : "";
    return `${needed} of ${needed} independent reviewer ${plural(needed, "accept", "accepts")}${extra}`;
  }
  if (gate === "triager_clearance") return "a triager's not-a-duplicate check";
  const needed = readiness.upvotesNeeded;
  const extra = readiness.upvotes > needed ? ` (${readiness.upvotes} in total)` : "";
  return `${needed} of ${needed} ${plural(needed, "upvote", "upvotes")}${extra}`;
}

/** "Still needed: …" then "Already in place: …", over the gates that matter here. */
function gateSummary(readiness: IssueReadiness, gates: readonly ReadinessGate[], neededLabel: string): string {
  const open = gates.filter((gate) => readiness.missing.includes(gate));
  const met = gates.filter((gate) => !readiness.missing.includes(gate));
  const parts = [`${neededLabel}: ${open.map((gate) => missingGateText(readiness, gate)).join("; ")}.`];
  if (met.length > 0) {
    parts.push(`Already in place: ${met.map((gate) => metGateText(readiness, gate)).join("; ")}.`);
  }
  return parts.join(" ");
}

/**
 * The refusal for an action that needs the issue to be ready, or (for
 * volunteering) only confirmed. `gates` says which gates the action needs;
 * the message lists the open ones first, then the ones already in place.
 */
export function notReadyMessage(
  readiness: IssueReadiness,
  action: string,
  gates: readonly ReadinessGate[] = ALL_GATES,
): string {
  return `This is still an idea, so it can't ${action} yet. ${gateSummary(readiness, gates, "Still needed")}`;
}

/** The banner at the top of an open issue. */
export function readinessBanner(readiness: IssueReadiness): string {
  if (readiness.ready) {
    return "This is an issue. Reviewers accepted it, a triager checked it is not a duplicate, and it has enough upvotes, so it can be passed on.";
  }
  return `This is an idea. ${gateSummary(readiness, ALL_GATES, "Before it can be passed on as an issue it still needs")}`;
}
