import type { Severity, Status } from "@prisma/client";
import type { IssueStage } from "@/lib/issue-stage";

/** Shared card shell for the issue detail redesign. */
export const issueCardClass =
  "rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-6";

export const issueRailCardClass =
  "rounded-[20px] border border-zk-border bg-zk-surface p-5";

export const issueSectionLabelClass =
  "text-xs font-bold uppercase tracking-[0.08em] text-zk-muted";

export const issueAccentLinkClass =
  "font-semibold text-zk-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong focus-visible:ring-offset-2";

/** Status language from the redesign handoff. Colour stays in the dot/text,
    not in a filled pill, so the title keeps the hierarchy. */
export const issueStatusChipClass: Record<Status, string> = {
  open: "text-zk-info-fg",
  in_progress: "text-zk-info-fg",
  resolved: "text-zk-ok-fg",
  closed: "text-zk-text2",
};

export const issueSeverityChipClass: Record<Severity, string> = {
  low: "text-zk-text2",
  medium: "text-zk-warn-fg",
  high: "text-zk-bad-fg",
  critical: "text-zk-bad-fg",
};

export const issueStageChipClass: Record<IssueStage, string> = {
  reported: "text-zk-text2",
  confirmed: "text-zk-ok-fg",
  ready: "text-zk-info-fg",
};

export const issueChipBaseClass =
  "inline-flex items-center gap-1.5 rounded-full border border-zk-border bg-zk-surface px-2.5 py-1 text-[11px] font-medium";
