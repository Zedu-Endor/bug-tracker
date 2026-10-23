import type { Severity, Status } from "@prisma/client";
import type { IssueStage } from "@/lib/issue-stage";

/**
 * The redesign's status language (ziki-redesign-handoff/HANDOFF.md):
 * priority uses bad/warn/chip tones, status uses info/ok/chip, and the
 * intake stage uses chip/ok/info. Shared so every screen says the same
 * thing with the same colours.
 */

export const severityTone: Record<Severity, string> = {
  low: "border border-line bg-chip text-ink-2",
  medium: "border border-warn-bd bg-warn-bg text-warn-fg",
  high: "border border-bad-bd bg-bad-bg text-bad-fg",
  critical: "border border-bad-bd bg-bad-bg text-bad-fg",
};

export const statusTone: Record<Status, string> = {
  open: "bg-info-bg text-info-fg",
  in_progress: "bg-info-bg text-info-fg",
  resolved: "bg-ok-bg text-ok-fg",
  closed: "bg-chip text-ink-2",
};

export const stageTone: Record<IssueStage, string> = {
  reported: "bg-chip text-ink-2",
  confirmed: "bg-ok-bg text-ok-fg",
  ready: "bg-info-bg text-info-fg",
};
