"use client";

import type { AgentLevel } from "@prisma/client";
import { useState, useTransition } from "react";
import { deleteAgentAction, regenerateAgentKeyAction, revokeAgentAction, setAgentAreaPreferencesAction, setAgentBurstAction, setAgentLevelAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import { AGENT_LEVEL_LABELS } from "@/lib/agents/levels";
import { LocalTime } from "@/components/local-time";
import type { AgentProjectChoice } from "./create-agent-form";

type BurstExpiryChoice = "keep" | "none" | "2h" | "8h" | "24h" | "custom";

function expiryHours(choice: BurstExpiryChoice): number | null {
  if (choice === "2h") return 2;
  if (choice === "8h") return 8;
  if (choice === "24h") return 24;
  return null;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** Change an agent's level or revoke it, as its owner or a team admin (#427). */
export function AgentControls({
  agentId,
  agentName,
  level,
  levels,
  projects,
  currentProjectId,
  burst = false,
  burstUntil = null,
  now,
  canSetBurst = false,
  areas = [],
  areaPreferences = [],
  revoked = false,
  personal = false,
  compact = false,
}: {
  agentId: string;
  agentName: string;
  level: AgentLevel;
  /** The levels this person may set. */
  levels: AgentLevel[];
  projects: AgentProjectChoice[];
  /** The project the live key is limited to, when it has one. */
  currentProjectId?: string | null;
  /** Whether this agent uses the higher hourly write budget. */
  burst?: boolean;
  /** When the higher budget lapses; null means no expiry (#596). */
  burstUntil?: string | Date | null;
  /** Server request time, used to label an expired grant without reading the clock during render. */
  now: string | Date;
  /** Admins may raise the budget. */
  canSetBurst?: boolean;
  areas?: { id: string; name: string; projectId: string }[];
  areaPreferences?: { projectId: string; projectAreaId: string }[];
  /** A revoked agent only offers delete. */
  revoked?: boolean;
  /** The automatic personal agent is created again on the next visit. */
  personal?: boolean;
  /** A tighter layout for the team list. */
  compact?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [current, setCurrent] = useState(level);
  const initialUntil = burstUntil ? new Date(burstUntil) : null;
  const initialUntilIso =
    initialUntil && Number.isFinite(initialUntil.getTime()) ? initialUntil.toISOString() : null;
  const [burstOn, setBurstOn] = useState(burst);
  const [savedUntil, setSavedUntil] = useState<string | null>(initialUntilIso);
  const [expiryChoice, setExpiryChoice] = useState<BurstExpiryChoice>(initialUntilIso ? "keep" : "none");
  const [customUntil, setCustomUntil] = useState("");
  const [projectId, setProjectId] = useState(currentProjectId || projects[0]?.id || "");
  const [preferenceProjectId, setPreferenceProjectId] = useState(currentProjectId || projects[0]?.id || "");
  const [savedPreferences, setSavedPreferences] = useState<Record<string, string[]>>(() => {
    const grouped: Record<string, string[]> = {};
    for (const preference of areaPreferences) {
      (grouped[preference.projectId] ??= []).push(preference.projectAreaId);
    }
    return Object.fromEntries(Object.entries(grouped).map(([id, ids]) => [id, [...ids].sort()]));
  });
  const [draftPreferences, setDraftPreferences] = useState<Record<string, string[]>>(savedPreferences);
  const [issued, setIssued] = useState<{ rawKey: string; prefix: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function changeLevel(next: AgentLevel) {
    const previous = current;
    setCurrent(next);
    startTransition(async () => {
      const result = await setAgentLevelAction(agentId, next);
      if (result.ok) {
        toast(`${agentName} is now ${AGENT_LEVEL_LABELS[next].toLowerCase()}.`, "success");
      } else {
        setCurrent(previous);
        toast(result.error, "error");
      }
    });
  }

  async function regenerate() {
    const projectName = projects.find((project) => project.id === projectId)?.name ?? "the chosen project";
    const ok = await confirm({
      title: `Regenerate the key for ${agentName}?`,
      body: `The current key stops working immediately. The new key only works in ${projectName}, and it stays on this agent's row.`,
      confirmLabel: "Regenerate key",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await regenerateAgentKeyAction(agentId, projectId);
      if (result.ok) {
        setIssued({ rawKey: result.rawKey, prefix: result.prefix });
        toast("New key issued. Copy it now.", "success");
      } else {
        toast(result.error, "error");
      }
    });
  }

  async function copyIssued() {
    if (!issued) return;
    toast((await copyText(issued.rawKey)) ? "Key copied." : "Couldn't copy. Select the key and copy it.");
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete ${agentName}?`,
      body: personal
        ? "The agent is removed from this list and its key stops working. A new personal agent is created the next time its owner opens Agents. Issues it filed stay. This can't be undone."
        : "The agent is removed from this list. Its key stops working, and any offer, claim, or bid it held is handed back. Issues it filed stay. This can't be undone.",
      confirmLabel: "Delete agent",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteAgentAction(agentId);
      toast(result.ok ? `${agentName} was deleted.` : result.error, result.ok ? "success" : "error");
    });
  }

  async function revoke() {
    const ok = await confirm({
      title: `Revoke ${agentName}?`,
      body: "Its keys stop working immediately. This can't be undone; register a new agent to replace it.",
      confirmLabel: "Revoke agent",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await revokeAgentAction(agentId);
      toast(result.ok ? `${agentName} was revoked.` : result.error, result.ok ? "success" : "error");
    });
  }

  /**
   * Resolves the selected expiry to an ISO timestamp. `keep` leaves the
   * existing grant alone; `custom` needs a valid future value from the input.
   */
  function resolvedUntil(choice: BurstExpiryChoice): string | null | "invalid" {
    if (choice === "none") return null;
    if (choice === "keep") return savedUntil;
    if (choice === "custom") {
      if (!customUntil) return "invalid";
      const date = new Date(customUntil);
      return Number.isFinite(date.getTime()) && date.getTime() > Date.now() ? date.toISOString() : "invalid";
    }
    const hours = expiryHours(choice);
    if (!hours) return null;
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }

  function saveBurst(next: boolean, choice: BurstExpiryChoice = expiryChoice) {
    let until: string | null = null;
    if (next) {
      const resolved = resolvedUntil(choice);
      if (resolved === "invalid") {
        toast("Choose an expiry time in the future, or choose no expiry.", "error");
        return;
      }
      until = resolved;
    }

    const previous = { on: burstOn, until: savedUntil };
    setBurstOn(next);
    setSavedUntil(until);
    startTransition(async () => {
      const result = await setAgentBurstAction(agentId, next, until);
      if (result.ok) {
        setSavedUntil(until);
        if (until) {
          setExpiryChoice("keep");
          setCustomUntil("");
        } else {
          setExpiryChoice("none");
          setCustomUntil("");
        }
        toast(
          !next
            ? `${agentName} is back to 30 writes an hour.`
            : until
              ? `${agentName} has the high-volume budget until ${new Date(until).toLocaleString()}.`
              : `${agentName} can now make 400 writes an hour, with no expiry.`,
          "success",
        );
      } else {
        setBurstOn(previous.on);
        setSavedUntil(previous.until);
        toast(result.error, "error");
      }
    });
  }

  function changeExpiry(next: BurstExpiryChoice) {
    setExpiryChoice(next);
    if (next === "keep" || next === "custom") return;
    if (burstOn) saveBurst(true, next);
  }

  const burstExpiresAt = savedUntil ? Date.parse(savedUntil) : null;
  const burstExpired = burstOn && burstExpiresAt !== null && burstExpiresAt <= new Date(now).getTime();

  const projectAreas = areas.filter((area) => area.projectId === preferenceProjectId);
  const selectedAreaIds = draftPreferences[preferenceProjectId] ?? [];
  const savedAreaIds = savedPreferences[preferenceProjectId] ?? [];
  const areaPreferencesChanged = selectedAreaIds.length !== savedAreaIds.length ||
    selectedAreaIds.some((id) => !savedAreaIds.includes(id));

  function toggleArea(areaId: string, checked: boolean) {
    setDraftPreferences((currentPreferences) => {
      const currentIds = currentPreferences[preferenceProjectId] ?? [];
      const nextIds = checked
        ? [...new Set([...currentIds, areaId])].sort()
        : currentIds.filter((id) => id !== areaId);
      return { ...currentPreferences, [preferenceProjectId]: nextIds };
    });
  }

  function saveAreaPreferences() {
    const nextIds = selectedAreaIds;
    startTransition(async () => {
      const result = await setAgentAreaPreferencesAction(agentId, preferenceProjectId, nextIds);
      if (result.ok) {
        setSavedPreferences((currentPreferences) => ({ ...currentPreferences, [preferenceProjectId]: [...nextIds] }));
        toast("Area preferences saved.", "success");
      } else {
        toast(result.error, "error");
      }
    });
  }

  if (revoked) {
    return (
      <Button type="button" variant="danger-secondary" onClick={remove} disabled={pending}>
        Delete
      </Button>
    );
  }

  const fields = (
    <div className={`grid gap-2.5 ${compact ? "sm:max-w-sm" : "sm:max-w-[440px]"} sm:grid-cols-2`}>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
        Role
        <Select
          id={`level-${agentId}`}
          value={current}
          disabled={pending}
          onChange={(event) => changeLevel(event.target.value as AgentLevel)}
          className="font-semibold"
        >
          {/* The current level stays listed even if this person can't set it. */}
          {[...new Set([current, ...levels])].map((option) => (
            <option key={option} value={option} disabled={!levels.includes(option)}>
              {AGENT_LEVEL_LABELS[option]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
        Project
        <Select
          id={`project-${agentId}`}
          value={projectId}
          disabled={pending || projects.length === 0}
          onChange={(event) => setProjectId(event.target.value)}
          className="font-semibold"
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );

  const burstControls = canSetBurst ? (
    <div className="flex flex-wrap items-center gap-2.5 rounded-xl bg-chip px-3 py-2">
      <label className="flex items-center gap-2 text-xs font-semibold text-ink-2">
        <input
          type="checkbox"
          checked={burstOn}
          disabled={pending}
          onChange={(event) => saveBurst(event.target.checked)}
          className="h-4 w-4 rounded border-line text-primary focus:ring-primary"
        />
        High-volume
      </label>
      {burstOn ? (
        <>
          <label htmlFor={`burst-expiry-${agentId}`} className="sr-only">
            High-volume expiry for {agentName}
          </label>
          <Select
            id={`burst-expiry-${agentId}`}
            value={expiryChoice}
            disabled={pending}
            onChange={(event) => changeExpiry(event.target.value as BurstExpiryChoice)}
            className="w-auto py-1 text-xs"
          >
            {savedUntil ? <option value="keep">Keep current expiry</option> : null}
            <option value="none">No expiry</option>
            <option value="2h">2 hours</option>
            <option value="8h">8 hours</option>
            <option value="24h">24 hours</option>
            <option value="custom">Custom…</option>
          </Select>
          {expiryChoice === "custom" ? (
            <>
              <label htmlFor={`burst-custom-${agentId}`} className="sr-only">
                Custom high-volume expiry for {agentName}
              </label>
              <Input
                id={`burst-custom-${agentId}`}
                type="datetime-local"
                value={customUntil}
                disabled={pending}
                onChange={(event) => setCustomUntil(event.target.value)}
                className="w-auto py-1 text-xs"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={pending || !customUntil}
                onClick={() => saveBurst(true, "custom")}
                className="h-8 px-3 text-xs"
              >
                Save expiry
              </Button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  ) : null;

  const burstNote =
    canSetBurst || burstOn ? (
      <p className="text-xs text-muted" suppressHydrationWarning>
        {!burstOn ? (
          "Standard budget: 30 writes an hour."
        ) : burstExpired ? (
          "High-volume expired; standard budget: 30 writes an hour."
        ) : savedUntil ? (
          <>
            High-volume until <LocalTime date={savedUntil} /> (400 writes an hour).
          </>
        ) : (
          "High-volume active with no expiry (400 writes an hour)."
        )}
      </p>
    ) : null;

  const issuedBox = issued ? (
    <div className="w-full space-y-2 rounded-xl border border-warn-bd bg-warn-bg p-3" role="status">
      <p className="text-sm font-semibold text-ink">
        New key for {agentName} ({issued.prefix}…). Copy it now. It stays on this agent&apos;s row.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          readOnly
          value={issued.rawKey}
          aria-label={`New key for ${agentName}`}
          className="font-mono text-xs"
          onFocus={(event) => event.currentTarget.select()}
        />
        <Button type="button" onClick={copyIssued}>
          Copy key
        </Button>
      </div>
    </div>
  ) : null;

  const areaPanel = (
    <details className="group w-full">
      <summary
        className={`inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-[13px] font-bold text-accent transition-colors hover:text-electric-blue-strong ${focusRing}`}
      >
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 transition-transform group-open:rotate-90"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
        Preferred areas{selectedAreaIds.length ? ` (${selectedAreaIds.length})` : ""}
      </summary>
      <div className="mt-2 space-y-3 rounded-xl border border-dashed border-line p-3.5">
        <p className="text-[13px] text-ink-2">Pick the areas this agent should look at first.</p>
        <label className="block text-xs font-semibold text-muted" htmlFor={`area-project-${agentId}`}>
          Project
        </label>
        <Select
          id={`area-project-${agentId}`}
          value={preferenceProjectId}
          disabled={pending || projects.length === 0}
          onChange={(event) => setPreferenceProjectId(event.target.value)}
        >
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </Select>
        {projectAreas.length ? (
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-semibold text-muted">Prefer this agent for</legend>
            <div className="flex flex-wrap gap-2">
              {projectAreas.map((area) => {
                const checked = selectedAreaIds.includes(area.id);
                return (
                  <label
                    key={area.id}
                    className={`inline-flex h-[34px] cursor-pointer items-center rounded-full border px-3.5 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-surface ${
                      checked
                        ? "border-primary bg-primary text-white"
                        : "border-line bg-surface text-ink hover:bg-tint"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={pending}
                      onChange={(event) => toggleArea(area.id, event.target.checked)}
                    />
                    {area.name}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ) : (
          <p className="text-xs text-muted">This project has no areas yet.</p>
        )}
        <Button type="button" variant="secondary" disabled={pending || !areaPreferencesChanged} onClick={saveAreaPreferences}>
          {pending ? "Saving…" : "Save area preferences"}
        </Button>
      </div>
    </details>
  );

  return (
    <div className={`flex w-full flex-col gap-3 ${compact ? "" : "pt-0.5"}`}>
      {fields}
      {burstControls}
      {burstNote}
      {issuedBox}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3 ${
          compact ? "sm:flex-nowrap" : ""
        }`}
      >
        {areaPanel}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={regenerate}
            disabled={pending || !projectId}
            className="h-10 px-4 text-[13px] font-bold"
          >
            <svg
              aria-hidden="true"
              className="mr-1.5 h-[15px] w-[15px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
              <path d="M21 3v5h-5" />
            </svg>
            Regenerate key
          </Button>
          <Button
            type="button"
            variant="danger-secondary"
            onClick={revoke}
            disabled={pending}
            className="h-10 px-4 text-[13px] font-bold"
          >
            Revoke
          </Button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label={`Delete ${agentName}`}
            title="Delete agent"
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bad-bd bg-bad-soft text-bad-fg transition-colors hover:bg-bad-bg disabled:opacity-50 ${focusRing}`}
          >
            <svg
              aria-hidden="true"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
