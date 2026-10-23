"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";
import { copyText } from "@/lib/clipboard";
import type { AgentTemplates } from "@/lib/agents/templates";
import {
  checkAgentConnectionAction,
  type ConnectionStatusResult,
} from "./actions";

type TabId = "claude" | "chatgpt" | "script" | "mcp";
type ScriptLang = "node" | "python";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const ASSISTANTS: {
  id: TabId;
  label: string;
  hint: string;
  icon: string;
}[] = [
  {
    id: "claude",
    label: "Claude Code / Desktop",
    hint: "Paste a prompt",
    icon: "m4 17 6-6-6-6M12 19h8",
  },
  {
    id: "chatgpt",
    label: "ChatGPT / Other Assistants",
    hint: "Paste a prompt",
    icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  },
  {
    id: "script",
    label: "Script (Node & Python)",
    hint: "Run a snippet",
    icon: "M16 18l6-6-6-6M8 6l-6 6 6 6",
  },
  {
    id: "mcp",
    label: "Claude Desktop (MCP)",
    hint: "Add a server config",
    icon: "M12 2v6M12 16v6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2",
  },
];

const HOW_TO: Record<TabId, string[]> = {
  claude: [
    "Copy the prompt block below.",
    "Paste it into your Claude Code session or Claude Desktop prompt.",
    "Claude will ask for an agent name, request a pairing code, and show you an approval link.",
    "Open the approval link in your browser to approve the pairing.",
    "Once Claude calls /agents/me, click Test connection below.",
  ],
  chatgpt: [
    "Copy the prompt block below.",
    "Paste it into ChatGPT or your assistant with web/curl access.",
    "Follow the assistant's prompt to approve the pairing code.",
    "Click Test connection below once your assistant has verified.",
  ],
  script: [
    "Pick your language, save the file locally, and run it.",
    "The script pairs automatically, saves the key locally, and long-polls /api/v1/events.",
    "Approve the pairing in your browser when the script prints the link.",
    "Click Test connection below once the script calls /agents/me.",
  ],
  mcp: [
    "In a clone of this repo, pair once with the command below.",
    "Build the server, then paste the config into claude_desktop_config.json.",
    "Restart Claude Desktop. Ziki's tools appear in the tools menu.",
    "Ask Claude to pair, approve the link, then test the connection.",
  ],
};

const STEP_LABELS = ["Choose assistant", "Copy setup", "Approve pairing", "Test connection"];

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-4 w-4 shrink-0 text-accent"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </svg>
  );
}

export function ConnectAgentView({
  templates,
  siteUrl,
  projectId,
  projectName,
  initialConnected = false,
  initialAgentName = null,
}: {
  templates: AgentTemplates;
  siteUrl: string;
  projectId: string | null;
  projectName: string | null;
  initialConnected?: boolean;
  initialAgentName?: string | null;
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabId>("claude");
  const [scriptLang, setScriptLang] = useState<ScriptLang>("node");
  const [copied, setCopied] = useState(false);
  const [pageOpenedAt] = useState(() => new Date().toISOString());

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatusResult>(
    () =>
      initialConnected
        ? {
            connected: true,
            agent: initialAgentName ? { id: "", name: initialAgentName } : undefined,
          }
        : { connected: false },
  );
  const [isPending, startTransition] = useTransition();

  const currentSnippet =
    activeTab === "claude"
      ? templates.claude
      : activeTab === "chatgpt"
        ? templates.chatgpt
        : activeTab === "mcp"
          ? templates.mcp
          : scriptLang === "node"
            ? templates.node
            : templates.python;

  const currentFilename =
    activeTab === "claude" || activeTab === "chatgpt"
      ? "prompt"
      : activeTab === "mcp"
        ? "claude_desktop_config.json"
        : scriptLang === "node"
        ? "agent.mjs"
        : "agent.py";

  const progress = connectionStatus.connected ? 4 : copied ? 3 : 1;

  async function handleCopy() {
    const ok = await copyText(currentSnippet);
    if (!ok) {
      toast("Could not copy automatically. Please select and copy the text.", "error");
      return;
    }
    setCopied(true);
    toast("Snippet copied to clipboard!", "success");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleTestConnection() {
    startTransition(async () => {
      const result = await checkAgentConnectionAction({
        projectId,
        since: pageOpenedAt,
      });
      setConnectionStatus(result);
      if (result.connected) {
        toast(
          `Connection verified! Agent "${result.agent?.name ?? "Agent"}" called /agents/me.`,
          "success",
        );
      } else {
        toast(result.message ?? "No agent call detected yet.", "info");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <ol
        aria-label="Progress"
        className="m-0 grid list-none gap-2.5 p-0 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]"
      >
        {STEP_LABELS.map((label, index) => {
          const step = index + 1;
          const done = step < progress || (step === 4 && connectionStatus.connected);
          const active = !done && step === progress;
          return (
            <li
              key={label}
              aria-current={active ? "step" : undefined}
              className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
                active ? "border-primary bg-row-sel" : "border-line bg-surface"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold ${
                  done
                    ? "bg-ok-bg text-ok-fg"
                    : active
                      ? "bg-primary text-white"
                      : "bg-chip text-muted"
                }`}
              >
                {done ? "âœ“" : step}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs font-semibold text-muted">Step {step}</span>
                <span className="text-sm font-bold text-ink">{label}</span>
              </span>
            </li>
          );
        })}
      </ol>

      <section className="flex flex-wrap items-center justify-between gap-3.5 rounded-[20px] border border-line bg-surface px-5 py-[18px]">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-deep-ocean text-primary"
          >
            <svg
              className="h-5 w-5"
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
            <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">
              Active project
            </span>
            <span className="text-[15px] font-bold text-ink">
              {projectName ?? "Default project"}{" "}
              {projectId ? (
                <span className="font-mono text-xs font-medium text-muted">({projectId})</span>
              ) : null}
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-chip px-3 py-1.5 text-[13px] text-ink-2">
          Target origin{" "}
          <strong className="font-mono font-semibold text-ink">{siteUrl}</strong>
        </span>
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
          <section
            aria-label="Choose your assistant"
            className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-[22px]"
          >
            <h2 className="text-lg font-bold text-ink">1. Choose your assistant</h2>
            <div
              role="tablist"
              aria-label="Assistant"
              className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]"
            >
              {ASSISTANTS.map((assistant) => {
                const active = activeTab === assistant.id;
                return (
                  <button
                    key={assistant.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setActiveTab(assistant.id);
                      setCopied(false);
                    }}
                    className={`flex flex-col gap-2 rounded-2xl p-3.5 text-left transition-colors ${focusRing} ${
                      active
                        ? "border-2 border-primary bg-row-sel"
                        : "m-px border border-line bg-surface hover:bg-tint"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        active ? "bg-primary text-white" : "bg-tint text-accent"
                      }`}
                    >
                      <svg
                        aria-hidden="true"
                        className="h-[18px] w-[18px]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={assistant.icon} />
                      </svg>
                    </span>
                    <span className="text-sm font-bold text-ink">{assistant.label}</span>
                    <span className="text-xs text-muted">{assistant.hint}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            aria-label="Setup"
            className="flex flex-col gap-4 rounded-[20px] border border-line bg-surface p-[22px]"
          >
            <h2 className="text-lg font-bold text-ink">2. Copy the setup block</h2>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {HOW_TO[activeTab].map((text, index) => (
                <li
                  key={text}
                  className="flex items-start gap-3 text-sm leading-relaxed text-ink-2"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-tint text-xs font-extrabold text-accent">
                    {index + 1}
                  </span>
                  {text}
                </li>
              ))}
            </ol>

            {activeTab === "script" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-muted">Script language</span>
                <div className="inline-flex rounded-full bg-seg p-0.5 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setScriptLang("node")}
                    className={`rounded-full px-2.5 py-1 transition-colors ${focusRing} ${
                      scriptLang === "node"
                        ? "bg-surface font-bold text-ink shadow-sm"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    Node.js
                  </button>
                  <button
                    type="button"
                    onClick={() => setScriptLang("python")}
                    className={`rounded-full px-2.5 py-1 transition-colors ${focusRing} ${
                      scriptLang === "python"
                        ? "bg-surface font-bold text-ink shadow-sm"
                        : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    Python 3
                  </button>
                </div>
              </div>
            ) : null}

            {activeTab === "mcp" ? (
              <p className="text-xs text-muted">
                The config holds no key. The server reads the one saved by{" "}
                <code className="font-mono">pair</code>.
              </p>
            ) : null}

            <div className="overflow-hidden rounded-2xl bg-deep-ocean">
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#1E2E52] px-4 py-2.5">
                <span className="inline-flex min-w-0 items-center gap-2 font-mono text-xs font-bold text-sidebar-muted">
                  <svg
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m4 17 6-6-6-6M12 19h8" />
                  </svg>
                  <span className="truncate">{currentFilename}</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`inline-flex h-[34px] items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold text-white transition-colors ${
                    copied ? "bg-ok-fg" : "bg-primary hover:bg-electric-blue-strong"
                  } ${focusRing}`}
                >
                  {copied ? "âœ“ Copied" : `Copy ${currentFilename}`}
                </button>
              </div>
              <pre className="m-0 max-h-[300px] overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px] leading-[1.7] text-sidebar-ink [scrollbar-width:thin]">
                {currentSnippet}
              </pre>
            </div>
          </section>

          <section
            aria-labelledby="test-connection-heading"
            className={`flex flex-wrap items-center justify-between gap-4 rounded-[20px] border p-[22px] transition-colors ${
              connectionStatus.connected
                ? "border-ok-fg bg-ok-bg"
                : "border-line bg-surface"
            }`}
          >
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
              <h2 id="test-connection-heading" className="text-lg font-bold text-ink">
                3. Approve, then test
              </h2>
              <span className="text-[13px] leading-relaxed text-muted">
                After you approve the pairing link and your agent calls{" "}
                <code className="rounded bg-chip px-1.5 py-0.5 font-mono text-xs text-ink">
                  /agents/me
                </code>
                , check the connection here.
              </span>
              {connectionStatus.connected ? (
                <span className="mt-1 inline-flex items-center gap-1.5 self-start rounded-full bg-ok-bg px-3 py-1 text-xs font-bold text-ok-fg">
                  <svg
                    aria-hidden="true"
                    className="h-[13px] w-[13px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Connected — {connectionStatus.agent?.name ?? "Agent"} reached /agents/me
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/settings/agents/pair"
                className={`inline-flex h-11 items-center rounded-full border border-line bg-surface px-[18px] text-sm font-bold text-ink transition-colors hover:bg-tint ${focusRing}`}
              >
                Approve code
              </Link>
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isPending}
                data-testid="test-connection-btn"
                className={`inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-bold text-white shadow-[0_8px_20px_rgba(46,111,239,0.30)] transition-colors disabled:opacity-60 ${focusRing} ${
                  connectionStatus.connected
                    ? "bg-ok-fg hover:opacity-90"
                    : "bg-primary hover:bg-electric-blue-strong"
                }`}
              >
                {isPending ? (
                  <>
                    <svg
                      className="h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Checking...
                  </>
                ) : connectionStatus.connected ? (
                  "Test again"
                ) : (
                  "Test connection"
                )}
              </button>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-[20px] border border-line bg-surface p-5">
            <h2 className="text-base font-bold text-ink">Good to know</h2>
            <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
              <InfoIcon />
              Connect one agent per level â€” observer, contributor, reviewer and so on.
            </div>
            <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
              <InfoIcon />
              Pairing codes last 15 minutes and work once.
            </div>
            <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
              <InfoIcon />
              The key goes straight to the agent â€” it never appears on this page.
            </div>
          </section>

          <section className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-tint p-5">
            <span className="text-[15px] font-bold text-ink">Need the full API?</span>
            <span className="text-[13px] leading-relaxed text-ink-2">
              The handbook covers pairing, keys and every endpoint.
            </span>
            <a
              href="/llms.txt"
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-8 items-center gap-1.5 self-start font-mono text-[13px] font-bold text-accent hover:underline ${focusRing}`}
            >
              /llms.txt
              <svg
                aria-hidden="true"
                className="h-[13px] w-[13px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </a>
            <div className="mt-1 flex flex-col gap-1 border-t border-line pt-2 text-xs font-semibold text-accent">
              <Link href="/settings/agents/pair" className="hover:underline">
                Approve a pending pairing code â†’
              </Link>
              <Link href="/settings/agents" className="hover:underline">
                Manage registered agents â†’
              </Link>
              <Link href="/settings/audit" className="hover:underline">
                View agent audit log â†’
              </Link>
              <Link href="/docs" className="hover:underline">
                Read the API docs â†’
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
