export const issueTypeBadgeClass: Record<string, string> = {
  Marketing: "bg-pink-100 text-pink-950 border-pink-200",
  Design: "bg-purple-100 text-purple-950 border-purple-200",
  Fix: "bg-amber-100 text-amber-950 border-amber-200",
  Feat: "bg-emerald-100 text-emerald-950 border-emerald-200",
};

export function getIssueTypeBadgeClass(name: string): string {
  return (
    issueTypeBadgeClass[name] ??
    "bg-indigo-100 text-indigo-950 border-indigo-200"
  );
}

/**
 * Token-backed type tones for the redesign, so a badge stays legible when the
 * page is dark. Names are workspace-defined; anything unknown falls back to
 * the neutral chip.
 */
export const issueTypeTokenClass: Record<string, string> = {
  Marketing: "border border-line bg-sec-bg text-sec-fg",
  Design: "border border-line bg-tint text-accent",
  Fix: "border border-warn-bd bg-warn-bg text-warn-fg",
  Feat: "border border-ok-fg/30 bg-ok-bg text-ok-fg",
  Security: "border border-bad-bd bg-bad-bg text-bad-fg",
};

export function getIssueTypeTokenClass(name: string): string {
  return issueTypeTokenClass[name] ?? "border border-line bg-chip text-ink-2";
}
