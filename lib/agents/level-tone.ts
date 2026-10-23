import type { AgentLevel } from "@prisma/client";

/**
 * The chip colours for an agent's level, from the redesign's status language
 * (Agents dropdown, Manage agents, Webhooks). Text always carries the level
 * too, so colour is never the only signal.
 */
export const AGENT_LEVEL_TONE: Record<AgentLevel, string> = {
  observer: "bg-chip text-ink-2",
  contributor: "bg-ok-bg text-ok-fg",
  triager: "bg-warn-bg text-warn-fg",
  reviewer: "bg-info-bg text-info-fg",
  dispatcher: "bg-sec-bg text-sec-fg",
  merger: "bg-sec-bg text-sec-fg",
};
