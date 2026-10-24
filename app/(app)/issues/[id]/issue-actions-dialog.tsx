"use client";
import { useId, useRef } from "react";

function ActionIcon({ kind }: { kind: "arrow" | "shield" | "eye" | "play" }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {kind === "arrow" ? <path d="M5 12h14m-6-6 6 6-6 6"/> : kind === "shield" ? <><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z"/><path d="m8 12 3 3 5-6"/></> : kind === "eye" ? <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></> : <path d="m8 4 12 8-12 8V4Z"/>}
  </svg>;
}

export function IssueActionsDialog() {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const navigate = (tab: "conversation" | "activity" | "decisions", filter?: "bid" | "review") => {
    menu.current?.hidePopover();
    document.getElementById(`issue-tab-${tab}`)?.click();
    if (filter) document.querySelector<HTMLButtonElement>(`#conversation [data-comment-filter="${filter}"]`)?.click();
    requestAnimationFrame(() => document.getElementById(`issue-panel-${tab}`)?.scrollIntoView({ block: "start", behavior: "smooth" }));
  };
  return <div className="issue-manage print:hidden">
    <button type="button" className="issue-actions-trigger" popoverTarget={id}>More actions <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="m6 9 6 6 6-6"/></svg></button>
    <div ref={menu} id={id} popover="auto" className="issue-actions-popover" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Issue actions</h2>
      <button type="button" onClick={() => navigate("conversation", "bid")}>View bids <ActionIcon kind="arrow"/></button>
      <button type="button" onClick={() => navigate("decisions")}>Triage &amp; confirmation <ActionIcon kind="shield"/></button>
      <button type="button" onClick={() => navigate("conversation", "review")}>Review the fix <ActionIcon kind="eye"/></button>
      <button type="button" onClick={() => navigate("activity")}>View progress <ActionIcon kind="play"/></button>
    </div>

  </div>;
}
