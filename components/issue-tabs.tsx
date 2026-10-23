"use client";

import { useState, type ReactNode } from "react";

type Section = "conversation" | "decisions";

/**
 * The issue's main sections as pill tabs (Issue.dc.html). Both panels stay
 * mounted so a half-written comment survives a look at the agent decisions,
 * and the server-rendered content is never refetched.
 */
export function IssueTabs({
  conversation,
  decisions,
  commentCount,
  decisionCount,
}: {
  conversation: ReactNode;
  decisions: ReactNode;
  commentCount: number;
  decisionCount: number;
}) {
  const [active, setActive] = useState<Section>("conversation");
  const sections: { id: Section; label: string; count: number; panel: ReactNode }[] = [
    { id: "conversation", label: "Conversation", count: commentCount, panel: conversation },
    ...(decisionCount > 0
      ? [{ id: "decisions" as const, label: "Agent decisions", count: decisionCount, panel: decisions }]
      : []),
  ];

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="Issue sections"
        className="flex w-fit max-w-full flex-wrap gap-1 rounded-full bg-seg p-1"
      >
        {sections.map((section) => {
          const selected = active === section.id;
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`issue-panel-${section.id}`}
              id={`issue-tab-${section.id}`}
              onClick={() => setActive(section.id)}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                selected
                  ? "bg-surface font-bold text-ink shadow-[0_1px_3px_rgba(21,18,31,0.12)]"
                  : "font-medium text-ink-2 hover:text-ink"
              }`}
            >
              {section.label}
              <span
                className={`rounded-full px-1.5 text-xs font-bold ${
                  selected ? "bg-tint text-accent" : "bg-chip-2 text-ink-2"
                }`}
              >
                {section.count}
              </span>
            </button>
          );
        })}
      </div>

      {sections.map((section) => (
        <div
          key={section.id}
          role="tabpanel"
          id={`issue-panel-${section.id}`}
          aria-labelledby={`issue-tab-${section.id}`}
          hidden={active !== section.id}
        >
          {section.panel}
        </div>
      ))}
    </div>
  );
}
