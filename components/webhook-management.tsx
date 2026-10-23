"use client";

import Link from "next/link";
import { useActionState, useState, useTransition, useCallback, useEffect, useRef } from "react";
import {
  createWebhookAction,
  type AgentChoice,
  type CreateWebhookResult,
  deleteWebhookAction,
  type DeleteWebhookResult,
  listWebhooksAction,
  type ListWebhooksResult,
  reEnableWebhookAction,
  type ReEnableWebhookResult,
  type WebhookSubscriptionRow,
} from "@/app/actions/webhooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { copyText } from "@/lib/clipboard";
import { RelativeTime } from "@/components/relative-time";
import { FieldError, useFieldErrors } from "@/components/ui/field-errors";
import { AGENT_LEVEL_LABELS } from "@/lib/agents/levels";
import { avatarTone } from "@/lib/avatar";
import { initialsOf } from "@/lib/header-nav";

const SECTION = "flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-[22px]";

function WebhookIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[26px] w-[26px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2" />
      <path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06" />
      <path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-5 w-5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function PlusIcon() {
  return (
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
  );
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-[15px] w-[15px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

type UrlState = "empty" | "nothttps" | "invalid" | "ok";

const URL_HINTS: Record<UrlState, { text: string; className: string }> = {
  empty: {
    text: "Must start with https:// — plain HTTP endpoints are not accepted.",
    className: "text-muted",
  },
  nothttps: {
    text: "Use an https:// address. Events are only delivered over HTTPS.",
    className: "font-bold text-bad-fg",
  },
  invalid: {
    text: "That doesn't look like a full URL yet.",
    className: "font-bold text-bad-fg",
  },
  ok: {
    text: "Looks good.",
    className: "font-bold text-ok-fg",
  },
};

function urlStateOf(value: string): UrlState {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return "nothttps";
    if (!parsed.hostname.includes(".")) return "invalid";
    return "ok";
  } catch {
    return "invalid";
  }
}

function statusBadge(enabled: boolean) {
  return enabled ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-bg px-2.5 py-[3px] text-xs font-bold text-ok-fg">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-bad-bd bg-bad-bg px-2.5 py-[3px] text-xs font-bold text-bad-fg">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      Disabled
    </span>
  );
}

export function WebhookManagement() {
  const toast = useToast();
  const confirm = useConfirm();

  const [subscriptions, setSubscriptions] = useState<WebhookSubscriptionRow[]>([]);
  const [agents, setAgents] = useState<AgentChoice[]>([]);
  const [listError, setListError] = useState<string | null>(null);

  async function load() {
    try {
      const result: ListWebhooksResult = await listWebhooksAction();
      if (result.ok) {
        setSubscriptions(result.subscriptions);
        setAgents(result.agents);
        setListError(null);
      } else {
        setListError(result.error);
      }
    } catch {
      setListError("Couldn't load webhook subscriptions. Please try again.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  const [agentId, setAgentId] = useState("");
  const [url, setUrl] = useState("");
  const [createdSecret, setCreatedSecret] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);
  const createFormRef = useRef<HTMLFormElement | null>(null);

  // --- Create form ---
  const [createResult, createAction, createPending] = useActionState<
    CreateWebhookResult | undefined,
    FormData
  >(
    async (_previous, formData) => {
      const next = await createWebhookAction(_previous, formData);
      if (next.ok) {
        setCreatedSecret(next.secret);
        setSecretCopied(false);
        setUrl("");
        await load();
      }
      return next;
    },
    undefined,
  );
  const createError = createResult && !createResult.ok ? createResult : null;

  const createFieldErrors = useFieldErrors("create-webhook-form", createFormRef);
  if (createError) {
    createFieldErrors.show(createError);
  }

  async function copyCreatedSecret() {
    const ok = await copyText(createdSecret);
    if (ok) setSecretCopied(true);
    toast(ok ? "Signing secret copied." : "Couldn't copy. Select the secret and copy it.");
  }

  // --- Re-enable ---
  const [, reEnableAction, reEnablePending] = useTransitionAction<
    ReEnableWebhookResult,
    string
  >(reEnableWebhookAction, async (result) => {
    if (result.ok) {
      toast("Webhook re-enabled.", "success");
      await load();
    } else {
      toast(result.error, "error");
    }
  });

  // --- Delete ---
  const [, deleteAction, deletePending] = useTransitionAction<
    DeleteWebhookResult,
    string
  >(deleteWebhookAction, async (result) => {
    if (result.ok) {
      toast("Webhook deleted.", "success");
      await load();
    } else {
      toast(result.error, "error");
    }
  });

  function handleReEnable(id: string) {
    void reEnableAction(id);
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Delete webhook subscription?",
      body: "This stops all future deliveries. It can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    void deleteAction(id);
  }

  const urlState = urlStateOf(url);
  const hint = URL_HINTS[urlState];
  const pickedAgent = agents.find((agent) => agent.id === agentId) ?? null;
  const canAdd = Boolean(pickedAgent) && urlState === "ok";
  const activeCount = subscriptions.filter((subscription) => subscription.enabled).length;
  const countLabel =
    subscriptions.length === 0
      ? "none yet"
      : activeCount === subscriptions.length
        ? `${activeCount} active`
        : `${activeCount} active · ${subscriptions.length} total`;

  if (listError) {
    return (
      <div
        className="flex flex-col gap-3 rounded-[20px] border border-bad-bd bg-bad-soft p-4 text-sm text-bad-fg"
        role="alert"
      >
        <p>{listError}</p>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void load()}
          className="self-start"
        >
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Subscriptions" className={SECTION}>
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-bold text-ink">Subscriptions</h2>
          <span className="text-[13px] text-muted">{countLabel}</span>
        </div>

        {subscriptions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-tint px-6 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-surface text-accent shadow-[0_8px_20px_rgba(46,111,239,0.15)]">
              <WebhookIcon />
            </span>
            <p className="text-base font-bold text-ink">No webhook subscriptions yet</p>
            <p className="max-w-[440px] text-sm leading-relaxed text-muted">
              Add one below to start receiving agent events at your own HTTPS endpoint.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {subscriptions.map((sub) => (
              <article
                key={sub.id}
                className="flex flex-wrap items-center gap-3.5 rounded-2xl border border-line px-4 py-3.5"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold ${avatarTone(sub.agent.name)}`}
                >
                  {initialsOf(sub.agent.name)}
                </span>
                <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1">
                  <span className="text-sm font-bold text-ink">{sub.agent.name}</span>
                  <a
                    href={sub.url}
                    className="truncate font-mono text-[13px] text-ink-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {sub.url}
                  </a>
                  {sub.failureCount > 0 || sub.lastError ? (
                    <span
                      className="truncate text-xs font-semibold text-bad-fg"
                      title={sub.lastError ?? undefined}
                    >
                      {sub.failureCount > 0
                        ? `${sub.failureCount} failed ${
                            sub.failureCount === 1 ? "delivery" : "deliveries"
                          }`
                        : "Last delivery failed"}
                      {sub.lastError ? ` — ${sub.lastError}` : ""}
                    </span>
                  ) : null}
                </div>
                {statusBadge(sub.enabled)}
                <span className="text-xs text-muted">
                  {sub.lastDeliveredAt ? (
                    <>
                      Delivered <RelativeTime date={sub.lastDeliveredAt} />
                    </>
                  ) : (
                    <>
                      Added <RelativeTime date={sub.createdAt} />
                    </>
                  )}
                </span>
                <div className="flex gap-1.5">
                  {!sub.enabled ? (
                    <button
                      type="button"
                      onClick={() => handleReEnable(sub.id)}
                      disabled={reEnablePending || deletePending}
                      className="h-9 rounded-full border border-line bg-surface px-3 text-[13px] font-bold text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
                    >
                      Re-enable
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Delete webhook for ${sub.agent.name}`}
                    title="Delete webhook"
                    onClick={() => handleDelete(sub.id)}
                    disabled={reEnablePending || deletePending}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-bad-bd bg-bad-soft text-bad-fg transition-colors hover:bg-bad-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad-bd disabled:opacity-50"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {createdSecret ? (
        <section
          role="status"
          className="flex flex-col gap-3 rounded-[20px] border border-warn-bd bg-warn-bg p-5 sm:px-[22px]"
        >
          <div className="flex items-start gap-3">
            <span className="text-warn-fg">
              <KeyIcon />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-[15px] font-bold text-warn-fg">
                Copy your signing secret now
              </h2>
              <p className="text-[13px] leading-relaxed text-ink-2">
                You&apos;ll use it to verify the HMAC-SHA256 signature on every delivery. For
                your security it&apos;s only shown once.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-[1_1_280px] overflow-x-auto whitespace-nowrap rounded-xl border border-warn-bd bg-surface px-3.5 py-3 font-mono text-[13px] text-ink">
              {createdSecret}
            </code>
            <Button
              type="button"
              onClick={copyCreatedSecret}
              className={`h-[42px] px-4 font-bold ${
                secretCopied ? "bg-ok-fg hover:bg-ok-fg" : ""
              }`}
            >
              {secretCopied ? "Copied" : "Copy secret"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setCreatedSecret("");
                setSecretCopied(false);
              }}
              className="h-[42px] px-4 font-bold"
            >
              Done
            </Button>
          </div>
        </section>
      ) : null}

      <section aria-label="Add webhook" className={`${SECTION} gap-[18px] p-6`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-ink">Add webhook</h2>
          <span className="text-[13px] leading-relaxed text-muted">
            Pick one of your agents, enter its HTTPS webhook endpoint, then copy the signing
            secret it generates.
          </span>
        </div>

        <form
          action={createAction}
          className="flex flex-col gap-[18px]"
          noValidate
          id="create-webhook-form"
          ref={createFormRef}
        >
          <div className="flex flex-col gap-2">
            <span id="webhook-agent-label" className="text-[13px] font-bold text-ink">
              Agent
            </span>
            {agents.length > 0 ? (
              <div
                id="agentId"
                role="radiogroup"
                aria-labelledby="webhook-agent-label"
                tabIndex={-1}
                className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]"
                {...createFieldErrors.attrs("agentId")}
              >
                {agents.map((agent) => {
                  const selected = agentId === agent.id;
                  return (
                    <label
                      key={agent.id}
                      className={`flex min-w-0 cursor-pointer items-center gap-2.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors focus-within:ring-2 focus-within:ring-primary ${
                        selected
                          ? "border-primary bg-row-sel ring-1 ring-primary"
                          : "border-line bg-surface hover:bg-tint"
                      }`}
                    >
                      <input
                        type="radio"
                        name="agentId"
                        value={agent.id}
                        checked={selected}
                        onChange={() => setAgentId(agent.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden="true"
                        className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-xs font-extrabold ${avatarTone(agent.name)}`}
                      >
                        {initialsOf(agent.name)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[13px] font-bold text-ink">
                          {agent.name}
                        </span>
                        <span className="text-xs text-muted">
                          {AGENT_LEVEL_LABELS[agent.level]}
                        </span>
                      </span>
                      <span
                        aria-hidden="true"
                        className={`h-[18px] w-[18px] shrink-0 rounded-full ${
                          selected
                            ? "border-[5px] border-primary bg-surface"
                            : "border-2 border-line"
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-[14px] border border-dashed border-line bg-tint px-4 py-3 text-sm text-muted">
                You don&apos;t have any agents yet.{" "}
                <Link
                  href="/settings/agents/new"
                  className="font-bold text-accent hover:underline"
                >
                  Create an agent
                </Link>{" "}
                to add a webhook.
              </p>
            )}
            <FieldError
              formId="create-webhook-form"
              field="agentId"
              errors={createFieldErrors.fieldErrors}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="webhook-url" className="text-[13px] font-bold text-ink">
              HTTPS endpoint URL
            </label>
            <div className="relative">
              <LockIcon />
              <Input
                id="webhook-url"
                name="url"
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/hooks/ziki"
                spellCheck={false}
                autoComplete="url"
                required
                maxLength={2048}
                className={`h-12 rounded-xl pl-10 font-mono text-sm ${
                  urlState === "nothttps" || urlState === "invalid"
                    ? "border-bad-fg focus:border-bad-fg focus:ring-bad-fg/20"
                    : urlState === "ok"
                      ? "border-ok-fg focus:border-ok-fg focus:ring-ok-fg/20"
                      : ""
                }`}
                {...createFieldErrors.attrs("url")}
                aria-describedby={
                  createFieldErrors.fieldErrors.url
                    ? "create-webhook-form-url-error"
                    : "webhook-url-hint"
                }
              />
            </div>
            <p id="webhook-url-hint" className={`text-xs ${hint.className}`}>
              {hint.text}
            </p>
            <FieldError
              formId="create-webhook-form"
              field="url"
              errors={createFieldErrors.fieldErrors}
            />
          </div>

          {createError ? (
            <p id="create-webhook-form-error" className="text-sm text-bad-fg" role="alert">
              {createError.error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
            <span className="min-w-0 text-[13px] text-muted" aria-live="polite">
              {pickedAgent
                ? `Events for ${pickedAgent.name}${
                    urlState === "ok" ? ` → ${url.trim()}` : ""
                  }`
                : "Choose an agent to continue"}
            </span>
            <Button
              type="submit"
              disabled={createPending || !canAdd}
              className="h-[46px] gap-2 px-[22px] text-sm font-bold shadow-[0_8px_20px_rgba(46,111,239,0.30)] disabled:shadow-none"
            >
              <PlusIcon />
              {createPending ? "Adding…" : "Add webhook"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function useTransitionAction<TResult, TId>(
  action: (id: TId) => Promise<TResult>,
  onDone: (result: TResult) => void | Promise<void>,
) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TResult | null>(null);

  const run = useCallback(
    (id: TId) => {
      startTransition(async () => {
        const next = await action(id);
        setResult(next);
        await onDone(next);
      });
    },
    [action, onDone],
  );

  return [result, run, pending] as const;
}
