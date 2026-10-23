"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { pairAgentAction, type PairingActionResult } from "../actions";
import { AGENT_LEVEL_LABELS } from "@/lib/agents/levels";
import { AGENT_LEVEL_TONE } from "@/lib/agents/level-tone";
import type { AgentLevel } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgentProjectChoice } from "../create-agent-form";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** ABCD2345 and ABCD-2345 both become ABCD-2345. */
function formatPairingCode(value: string): string {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

/**
 * Approve an agent that asked to join (#427). A link from the agent opens
 * straight on the confirm step. The agent then collects its own key.
 */
export function PairForm({
  initialCode,
  pending,
  unknownCode,
  projects,
  activeProjectId,
  instructionsMaxLength,
}: {
  initialCode: string;
  pending: { name: string; model: string | null; level: AgentLevel | null; instructions: string | null } | null;
  unknownCode: boolean;
  projects: AgentProjectChoice[];
  activeProjectId: string | null;
  instructionsMaxLength: number;
}) {
  const [code, setCode] = useState(formatPairingCode(initialCode));
  // The owner's edits to the instructions, tied to the code they were made for.
  // Kept in state because a form action resets uncontrolled fields when it
  // returns, even with an error; a retry must send the owner's text, not the
  // agent's proposal again (#431).
  const [instructionsDraft, setInstructionsDraft] = useState<{ code: string; value: string } | null>(null);
  const [result, action, pendingAction] = useActionState<PairingActionResult | undefined, FormData>(
    pairAgentAction,
    undefined,
  );

  if (result?.ok && result.step === "done") {
    return (
      <section
        role="status"
        className="flex flex-col items-center gap-3.5 rounded-3xl border border-line bg-surface px-7 py-9 text-center"
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-ok-bg text-ok-fg">
          <svg
            aria-hidden="true"
            className="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h2 className="text-[22px] font-extrabold text-ink">{result.name} is approved</h2>
        <p className="max-w-[420px] text-sm leading-relaxed text-muted">
          It is listed under Your agents now. It picks up its key on its next check, within a few seconds.
        </p>
        <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/settings/agents/connect"
            className={`inline-flex h-11 items-center rounded-full border border-line bg-surface px-[18px] text-sm font-bold text-ink transition-colors hover:bg-tint ${focusRing}`}
          >
            Back to setup
          </Link>
          <Link
            href="/settings/agents"
            className={`inline-flex h-11 items-center rounded-full bg-primary px-[18px] text-sm font-bold text-white transition-colors hover:bg-electric-blue-strong ${focusRing}`}
          >
            View your agents
          </Link>
        </div>
      </section>
    );
  }

  const confirm =
    result?.ok && result.step === "confirm"
      ? result
      : pending && !result?.ok
        ? {
            code: formatPairingCode(initialCode),
            name: pending.name,
            model: pending.model,
            level: pending.level ?? "contributor",
            instructions: pending.instructions,
          }
        : null;
  const error = result && !result.ok ? result.error : unknownCode && !result
    ? "That code doesn't match a waiting agent. It may have expired; ask the agent for a new one."
    : null;

  if (confirm) {
    const instructionsValue =
      instructionsDraft?.code === confirm.code ? instructionsDraft.value : (confirm.instructions ?? "");
    const projectDefault =
      activeProjectId && projects.some((project) => project.id === activeProjectId)
        ? activeProjectId
        : projects[0]?.id;

    return (
      <form
        action={action}
        className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 shadow-[0_24px_60px_rgba(11,23,51,0.08)] sm:p-7"
      >
        <input type="hidden" name="code" value={confirm.code} />
        <input type="hidden" name="intent" value="approve" />

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
            Pairing request · <span className="font-mono text-ink">{confirm.code}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-bg px-2.5 py-1 text-xs font-bold text-warn-fg">
            <svg
              aria-hidden="true"
              className="h-[13px] w-[13px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
            Lasts 15 minutes
          </span>
        </div>

        <div className="flex items-center gap-3.5 rounded-2xl bg-tint p-4">
          <span
            aria-hidden="true"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-extrabold text-white"
          >
            {confirm.name.trim().charAt(0).toUpperCase() || "?"}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="break-words text-[17px] font-extrabold text-ink">{confirm.name}</span>
            <span className="text-[13px] text-ink-2">
              {confirm.model ? `${confirm.model} · ` : ""}wants to join as{" "}
              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${AGENT_LEVEL_TONE[confirm.level]}`}>
                {AGENT_LEVEL_LABELS[confirm.level]}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-warn-bd bg-warn-bg px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
          <svg
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 shrink-0 text-warn-fg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
          Only approve an agent you asked to set itself up. It will act on Ziki in your name. Its key
          works only in the project you choose, and it is sent back to the agent.
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="pair-instructions" className="text-[13px] font-bold text-ink">
            Standing instructions <span className="font-medium text-muted">(optional)</span>
          </label>
          <Textarea
            id="pair-instructions"
            name="instructions"
            rows={4}
            maxLength={instructionsMaxLength}
            value={instructionsValue}
            onChange={(event) => setInstructionsDraft({ code: confirm.code, value: event.target.value })}
            aria-describedby="pair-instructions-help"
          />
          <p id="pair-instructions-help" className="text-xs leading-relaxed text-muted">
            {confirm.instructions
              ? "Suggested by the agent. Edit or clear it. The agent gets only what you approve here."
              : "A standing brief the agent reads from GET /api/v1/agents/me, such as focus areas. You can change it later in settings."}
          </p>
        </div>

        {projects.length === 0 ? (
          <p className="text-sm font-semibold text-bad-fg" role="alert">
            This workspace has no projects yet, so the agent can&apos;t be given a key.
          </p>
        ) : (
          <label className="flex flex-col gap-1.5 text-[13px] font-bold text-ink sm:max-w-xs">
            Project
            <Select id="pair-project" name="projectId" defaultValue={projectDefault} required>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        {error ? (
          <p className="text-sm font-semibold text-bad-fg" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2.5">
          <Button
            type="submit"
            disabled={pendingAction || projects.length === 0}
            className="h-12 flex-[2_1_200px] text-[15px] font-bold shadow-[0_8px_20px_rgba(46,111,239,0.30)]"
          >
            {pendingAction ? "Approving…" : "Approve agent"}
          </Button>
          <Link
            href="/settings/agents"
            className={`inline-flex h-12 flex-[1_1_140px] items-center justify-center rounded-full border border-line bg-surface px-4 text-[15px] font-bold text-ink transition-colors hover:bg-tint ${focusRing}`}
          >
            Cancel
          </Link>
        </div>
      </form>
    );
  }

  return (
    <form
      action={action}
      className="flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 shadow-[0_24px_60px_rgba(11,23,51,0.08)] sm:p-7"
      noValidate
    >
      <div className="flex items-center gap-3.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-tint text-accent">
          <svg
            aria-hidden="true"
            className="h-[22px] w-[22px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="4" y="8" width="16" height="12" rx="2" />
            <path d="M12 4v4M9 14h.01M15 14h.01" />
          </svg>
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-bold text-ink">Enter the code from your agent</h2>
          <span className="text-[13px] text-muted">It looks like ABCD-2345.</span>
        </div>
      </div>

      <label htmlFor="pair-code" className="flex flex-col">
        <span className="sr-only">Pairing code</span>
        <Input
          id="pair-code"
          name="code"
          value={code}
          onChange={(event) => setCode(formatPairingCode(event.target.value))}
          placeholder="ABCD-2345"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={9}
          className="h-16 border-2 px-4 text-center font-mono text-[26px] font-bold uppercase tracking-[0.3em]"
          style={code.length === 9 ? { borderColor: "var(--okFg)" } : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "pair-error" : undefined}
          required
        />
      </label>
      <p className="-mt-2 text-center text-xs text-muted">
        {code.length === 9
          ? "Code looks right."
          : code.length > 0
            ? "Keep going — 8 letters or numbers."
            : "Letters and numbers only. The dash is added for you."}
      </p>

      {error ? (
        <p id="pair-error" className="text-sm font-semibold text-bad-fg" role="alert">
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={pendingAction || code.length !== 9}
        className="h-[50px] w-full text-[15px] font-bold shadow-[0_8px_20px_rgba(46,111,239,0.30)]"
      >
        {pendingAction ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}
