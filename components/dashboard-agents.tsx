"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BASE_PATH } from "@/lib/base-path";
import { RelativeTime } from "@/components/relative-time";

/**
 * The serialized row the server sends and the poll endpoint returns. Kept
 * local (not imported from the server-only data module) so this client
 * component has no edge into server code.
 */
export type DashboardAgentStatus = "waiting" | "working" | "idle" | "offline";

export type DashboardAgentView = {
  id: string;
  name: string;
  model: string | null;
  level: string;
  status: DashboardAgentStatus;
  activity: string;
  lastSeenAt: string | null;
};

export const AGENTS_POLL_MS = 30_000;

const statusMeta: Record<
  DashboardAgentStatus,
  { label: string; dot: string; text: string }
> = {
  waiting: { label: "Waiting on you", dot: "bg-sky-tint", text: "text-accent" },
  working: { label: "Working", dot: "bg-warn-fg", text: "text-warn-fg" },
  idle: { label: "Idle", dot: "bg-ok-fg", text: "text-ok-fg" },
  offline: { label: "Offline", dot: "bg-chip-2", text: "text-muted" },
};

export function DashboardAgents({
  initial,
}: {
  initial: DashboardAgentView[];
}) {
  const [agents, setAgents] = useState(initial);
  const [open, setOpen] = useState(true);

  // Section-only refresh: the cards above are not re-fetched, so the page
  // never jumps while someone is reading it.
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const poll = async () => {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await fetch(`${BASE_PATH}/api/dashboard/agents`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || controller.signal.aborted) return;
        const data = (await response.json()) as { agents?: DashboardAgentView[] };
        if (!controller.signal.aborted && Array.isArray(data.agents)) setAgents(data.agents);
      } catch {
        // A failed or aborted poll keeps the last good rows; the next one retries.
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(poll, AGENTS_POLL_MS);
    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, []);

  return (
    <section
      aria-labelledby="agents-heading"
      className="overflow-hidden rounded-[20px] border border-line bg-surface"
    >
      <div className="flex items-center justify-between border-b border-divider px-5 py-4">
        <div className="flex items-center gap-2.5">
          <h2 id="agents-heading" className="text-base font-bold text-ink sm:text-lg">
            Your agents
          </h2>
          <span
            aria-label={`${agents.length} agent${agents.length === 1 ? "" : "s"}`}
            className="rounded-full bg-tint px-2 py-0.5 text-xs font-bold text-accent"
          >
            {agents.length}
          </span>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="agents-body"
          aria-label="Toggle Your agents section"
          onClick={() => setOpen((value) => !value)}
          className="rounded-full p-1 text-muted transition hover:bg-tint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <svg
            className={`h-5 w-5 transition-transform motion-safe:duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open ? (
        <div id="agents-body">
          {agents.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="font-bold text-ink">No agents yet</p>
              <p className="mt-1 text-sm text-muted">
                Pair an agent to let it work on your issues and report back here.
              </p>
              <Link
                href="/settings/agents/pair"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-white transition hover:bg-electric-blue-strong"
              >
                Pair your first agent
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-divider bg-tint text-xs font-bold uppercase tracking-wider text-accent">
                    <th scope="col" className="px-5 py-3">Agent</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="px-5 py-3">Current activity</th>
                    <th scope="col" className="px-5 py-3 text-right">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-divider">
                  {agents.map((agent) => {
                    const meta = statusMeta[agent.status];
                    return (
                      <tr key={agent.id} className="transition hover:bg-row-sel">
                        <td className="px-5 py-3.5 font-semibold text-ink">
                          <span className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`}
                              aria-hidden="true"
                            />
                            <span className="truncate">{agent.name}</span>
                            {agent.model ? (
                              <span className="truncate text-xs font-normal text-muted">
                                {agent.model}
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className={`whitespace-nowrap px-5 py-3.5 font-medium ${meta.text}`}>
                          {meta.label}
                        </td>
                        <td className="max-w-[22rem] truncate px-5 py-3.5 text-ink-2">
                          {agent.activity}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right font-mono text-xs text-muted">
                          {agent.lastSeenAt ? (
                            <RelativeTime date={agent.lastSeenAt} />
                          ) : (
                            "Never"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
