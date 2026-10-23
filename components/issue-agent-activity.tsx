import type { Severity } from "@prisma/client";
import { severityLabel } from "@/lib/labels";
import { LocalTime } from "@/components/local-time";
import { ClaimDeadline } from "@/components/claim-deadline";
import { ExpandableText } from "@/components/expandable-text";

/**
 * What agents decided on one issue, in sentences (#448). The raw audit dump
 * stays on the audit page (#447); nothing here renders a JSON payload.
 */
export type AgentDecision =
  | {
      id: string;
      at: Date | string;
      kind: "confirmed";
      agentName: string;
      /** The person the agent acted for. */
      personName: string;
      severity: Severity | null;
    }
  | {
      id: string;
      at: Date | string;
      /** #1122: a reviewer found it isn't a real issue. Never a confirmation. */
      kind: "rejected";
      agentName: string;
      personName: string;
      /** The reviewer's reasons, usually the reproduction they tried. */
      notes: string | null;
    }
  | {
      id: string;
      at: Date | string;
      kind: "claimed";
      agentName: string;
      personName: string;
      /** #593: the delivery deadline, and whether the one extension was used. */
      deliverBy?: Date | string | null;
      extendedAt?: Date | string | null;
      /** #606: the agent's owner, while the claim is paused on their answer. */
      waitingOnName?: string | null;
    }
  | { id: string; at: Date | string; kind: "verdict"; agentName: string; personName: string; goodToMerge: boolean }
  | { id: string; at: Date | string; kind: "accepted"; agentName: string };

function timeOf(decision: AgentDecision): number {
  return new Date(decision.at).getTime();
}

/** The chip and icon tone for each kind of decision, in the redesign palette. */
function decisionTone(decision: AgentDecision): string {
  switch (decision.kind) {
    case "confirmed":
      return "bg-ok-bg text-ok-fg";
    case "rejected":
      return "bg-bad-bg text-bad-fg";
    case "claimed":
      return "bg-info-bg text-info-fg";
    case "verdict":
      return decision.goodToMerge ? "bg-ok-bg text-ok-fg" : "bg-warn-bg text-warn-fg";
    case "accepted":
      return "bg-ok-bg text-ok-fg";
  }
}

function decisionLabel(decision: AgentDecision): string {
  switch (decision.kind) {
    case "confirmed":
      return "Confirmed";
    case "rejected":
      return "Not a real issue";
    case "claimed":
      return "Claimed";
    case "verdict":
      return decision.goodToMerge ? "Good to merge" : "Not ready to merge";
    case "accepted":
      return "Fix accepted";
  }
}

function decisionIcon(decision: AgentDecision): string {
  switch (decision.kind) {
    case "confirmed":
    case "accepted":
      return "✓";
    case "rejected":
      return "✕";
    case "claimed":
      return "✋";
    case "verdict":
      return decision.goodToMerge ? "⇄" : "!";
  }
}

function sentence(decision: AgentDecision) {
  switch (decision.kind) {
    case "confirmed":
      return (
        <>
          <span className="font-bold text-ink">{decision.agentName}</span> confirmed this issue as real
          {decision.severity ? (
            <>
              {" "}
              and set the severity to{" "}
              <span className="font-bold text-ink">{severityLabel[decision.severity]}</span>
            </>
          ) : null}
          {decision.personName ? <> on behalf of {decision.personName}</> : null}.
        </>
      );
    case "rejected":
      return (
        <>
          <span className="font-bold text-ink">{decision.agentName}</span> found this isn&apos;t a real
          issue{decision.personName ? <> on behalf of {decision.personName}</> : null}.
        </>
      );
    case "claimed":
      return (
        <>
          <span className="font-bold text-ink">{decision.agentName}</span> claimed this issue for{" "}
          {decision.personName}.
          {decision.waitingOnName ? (
            <>
              {" "}
              Waiting for {decision.waitingOnName} to answer {decision.agentName}&apos;s question.
            </>
          ) : decision.deliverBy ? (
            <>
              {" "}
              <ClaimDeadline deliverBy={decision.deliverBy} />
              {decision.extendedAt ? " (extension used)" : ""}.
            </>
          ) : null}
        </>
      );
    case "verdict":
      return (
        <>
          <span className="font-bold text-ink">{decision.agentName}</span> said this fix is{" "}
          {decision.goodToMerge ? "good to merge" : "not ready to merge"}.
        </>
      );
    case "accepted":
      return (
        <>
          <span className="font-bold text-ink">{decision.agentName}</span> accepted the fix and marked this
          issue resolved.
        </>
      );
  }
}

/**
 * The agent decisions on an issue, oldest first. Renders nothing when there
 * are none, so an issue with no agent activity omits the section.
 */
export function IssueAgentActivity({ decisions }: { decisions: ReadonlyArray<AgentDecision> }) {
  if (decisions.length === 0) return null;

  const ordered = [...decisions].sort((a, b) => timeOf(a) - timeOf(b) || a.id.localeCompare(b.id));

  return (
    <section
      aria-label="Agent decisions"
      className="rounded-[20px] border border-line bg-surface p-5 sm:p-6"
    >
      <h2 className="sr-only">Agent decisions</h2>
      <ol className="space-y-0">
        {ordered.map((decision, index) => (
          <li key={decision.id} className="flex gap-3.5">
            <div className="flex flex-col items-center">
              <span
                aria-hidden
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${decisionTone(decision)}`}
              >
                {decisionIcon(decision)}
              </span>
              {index < ordered.length - 1 ? (
                <span aria-hidden className="mt-1 w-0.5 flex-1 bg-divider" />
              ) : null}
            </div>
            <div className={`min-w-0 flex-1 ${index < ordered.length - 1 ? "pb-5" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${decisionTone(decision)}`}
                >
                  {decisionLabel(decision)}
                </span>
                <LocalTime className="text-xs text-muted" date={decision.at} />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{sentence(decision)}</p>
              {decision.kind === "rejected" && decision.notes ? (
                <ExpandableText maxLines={3} expandText="View more" collapseText="View less">
                  <blockquote className="mt-2 whitespace-pre-wrap break-words rounded-r-[10px] border-l-[3px] border-line bg-chip px-3.5 py-2.5 text-sm text-ink-2">
                    {decision.notes}
                  </blockquote>
                </ExpandableText>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
