"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { createAgentAction, type CreateAgentActionResult } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { AGENT_LEVEL_DESCRIPTIONS, AGENT_LEVEL_LABELS, SELF_REGISTRATION_LEVELS } from "@/lib/agents/levels";
import type { AgentLevel } from "@prisma/client";
import { AGENT_MODEL_MAX, AGENT_NAME_MAX } from "@/lib/agents/registry-limits";

export type AgentProjectChoice = { id: string; name: string };

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** One path per level, matching the redesign's role cards. */
const LEVEL_ICONS: Record<AgentLevel, string> = {
  observer: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  contributor: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  triager: "M3 6h18M7 12h10M10 18h4",
  reviewer: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  dispatcher: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  merger: "M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21V9a9 9 0 0 0 9 9",
};

/** Register an agent; its key is shown here once and never again (#427). */
export function CreateAgentForm({
  projects,
  activeProjectId = null,
  levels = SELF_REGISTRATION_LEVELS,
}: {
  projects: AgentProjectChoice[];
  activeProjectId?: string | null;
  levels?: readonly AgentLevel[];
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [level, setLevel] = useState<AgentLevel>(levels[0] ?? "observer");
  const [issued, setIssued] = useState<Extract<CreateAgentActionResult, { ok: true }> | null>(null);
  const [result, action, pending] = useActionState<CreateAgentActionResult | undefined, FormData>(
    async (previous, formData) => {
      const next = await createAgentAction(previous, formData);
      if (next.ok) {
        setIssued(next);
        setName("");
        setModel("");
      }
      return next;
    },
    undefined,
  );
  const error = result && !result.ok ? result : null;

  // Put the person on the key, so it's selected and ready to copy.
  useEffect(() => {
    if (issued) document.getElementById("new-agent-key")?.focus();
  }, [issued]);

  async function copy() {
    if (!issued) return;
    toast((await copyText(issued.rawKey)) ? "Key copied." : "Couldn't copy. Select the key and copy it.");
  }

  if (issued) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-warn-bd bg-warn-bg p-4" role="status">
        <p className="text-sm font-semibold text-ink">
          {issued.name} is registered. Copy its key now. It stays on this page with the agent.
        </p>
        <label htmlFor="new-agent-key" className="sr-only">
          Agent key
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="new-agent-key"
            readOnly
            value={issued.rawKey}
            className="font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button type="button" onClick={copy}>
            Copy key
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-ink-2">
          The agent sends it as <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>. If
          it&apos;s lost, regenerate the key on this page. The current key stops working immediately.
        </p>
        <Button type="button" variant="secondary" onClick={() => setIssued(null)}>
          I&apos;ve saved it
        </Button>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted">
        This workspace has no projects yet, so a key can&apos;t be limited to one.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        <label htmlFor="agent-name" className="flex flex-col gap-1.5 text-[13px] font-bold text-ink">
          Name
          <Input
            id="agent-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada's Claude"
            maxLength={AGENT_NAME_MAX + 20}
            required
            aria-invalid={error?.field === "name" || undefined}
            aria-describedby={error ? "agent-form-error" : undefined}
            className="h-[46px]"
          />
        </label>
        <label htmlFor="agent-model" className="flex flex-col gap-1.5 text-[13px] font-bold text-ink">
          <span>
            Model <span className="font-medium text-muted">(optional)</span>
          </span>
          <Input
            id="agent-model"
            name="model"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Claude, GPT, …"
            maxLength={AGENT_MODEL_MAX + 20}
            aria-invalid={error?.field === "model" || undefined}
            className="h-[46px]"
          />
        </label>
        <label htmlFor="agent-project" className="flex flex-col gap-1.5 text-[13px] font-bold text-ink">
          Project
          <Select
            id="agent-project"
            name="projectId"
            defaultValue={
              activeProjectId && projects.some((project) => project.id === activeProjectId)
                ? activeProjectId
                : projects[0]?.id
            }
            required
            aria-invalid={error?.field === "projectId" || undefined}
            className="h-[46px] font-semibold"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <span className="text-xs font-medium text-muted">The key only works in this project.</span>
        </label>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span id="agent-level-label" className="text-[13px] font-bold text-ink">
            Starting level
          </span>
          <span className="text-xs text-muted">All working roles can read and comment.</span>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="agent-level-label"
          className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
        >
          {levels.map((option) => {
            const checked = level === option;
            const needsAdmin = option === "dispatcher" || option === "merger";
            return (
              <label
                key={option}
                className={`flex cursor-pointer flex-col gap-2 rounded-2xl p-4 text-left transition-colors ${
                  checked
                    ? "border-2 border-primary bg-row-sel"
                    : "border border-line bg-surface hover:bg-tint"
                } ${checked ? "" : "m-px"} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface`}
              >
                <input
                  type="radio"
                  name="level"
                  value={option}
                  checked={checked}
                  onChange={() => setLevel(option)}
                  className="sr-only"
                />
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-[10px] ${
                        checked ? "bg-primary text-white" : "bg-tint text-accent"
                      }`}
                    >
                      <svg
                        aria-hidden="true"
                        className="h-[17px] w-[17px]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={LEVEL_ICONS[option]} />
                      </svg>
                    </span>
                    <span className="text-[15px] font-bold text-ink">{AGENT_LEVEL_LABELS[option]}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`h-[18px] w-[18px] shrink-0 rounded-full ${
                      checked ? "border-[5px] border-primary bg-white" : "border-2 border-line"
                    }`}
                  />
                </span>
                <span className="text-[13px] leading-relaxed text-ink-2">
                  {AGENT_LEVEL_DESCRIPTIONS[option]}
                </span>
                {needsAdmin ? (
                  <span className="self-start rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-bold text-warn-fg">
                    Needs tenant admin grant
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>

      {error ? (
        <p id="agent-form-error" className="text-sm font-semibold text-bad-fg" role="alert">
          {error.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
        <span className="text-[13px] text-muted">
          Registering as <strong className="text-ink">{AGENT_LEVEL_LABELS[level]}</strong> in this workspace
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/settings/agents"
            className={`inline-flex h-11 items-center rounded-full border border-line bg-surface px-[18px] text-sm font-bold text-ink transition-colors hover:bg-tint ${focusRing}`}
          >
            Cancel
          </Link>
          <Button
            type="submit"
            disabled={pending}
            className="h-11 gap-2 px-5 text-sm font-bold shadow-[0_8px_20px_rgba(46,111,239,0.30)]"
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            {pending ? "Registering…" : "Register agent"}
          </Button>
        </div>
      </div>
    </form>
  );
}
