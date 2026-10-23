"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  answerEscalationAction,
  quickResolveEscalationAction,
  type AnswerActionResult,
} from "./actions";
import type { EscalationType } from "@/lib/agent-questions";

export function EscalationTypeBadge({ type }: { type: EscalationType | string }) {
  const styles: Record<string, string> = {
    Blocker: "border-bad-bd bg-bad-bg text-bad-fg",
    "Work Authorization": "border-warn-bd bg-warn-bg text-warn-fg",
    "Human Approval": "border-sec-fg/30 bg-sec-bg text-sec-fg",
    "Scope Expansion": "border-info-fg/30 bg-info-bg text-info-fg",
    Question: "border-line bg-chip text-ink-2",
    Redesign: "border-line bg-tint text-accent",
  };

  const icons: Record<string, string> = {
    Blocker: "🛑",
    "Work Authorization": "🛡️",
    "Human Approval": "👤",
    "Scope Expansion": "⚠️",
    Question: "❓",
    Redesign: "✎",
  };

  const badgeStyle = styles[type] ?? styles.Question;
  const icon = icons[type] ?? "❓";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-bold ${badgeStyle}`}
    >
      <span aria-hidden="true">{icon}</span>
      <span>{type}</span>
    </span>
  );
}

export function QuickResolveButtons({
  escalationId,
  onResolved,
}: {
  escalationId: string;
  onResolved?: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleResolve = (actionType: "approve" | "authorize") => {
    setError(null);
    startTransition(async () => {
      const res = await quickResolveEscalationAction(escalationId, actionType);
      if (res.ok) {
        onResolved?.();
        router.refresh();
      } else {
        // A refused action (no permission, gone, already answered) must say
        // so — otherwise the button just returns to idle as if it worked.
        setError(res.error);
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={isPending}
          onClick={() => handleResolve("approve")}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1.5"
        >
          {isPending ? "Unblocking…" : "✓ Approve & Unblock"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={isPending}
          onClick={() => handleResolve("authorize")}
          className="text-xs px-2.5 py-1.5"
        >
          Authorize Work
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function EscalationAnswerForm({
  escalationId,
  labelledBy,
}: {
  escalationId: string;
  labelledBy?: string;
}) {
  const [result, action, pending] = useActionState<AnswerActionResult | undefined, FormData>(
    answerEscalationAction,
    undefined,
  );
  const error = result && !result.ok ? result.error : null;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="escalationId" value={escalationId} />
      <div className="space-y-1">
        {!labelledBy ? (
          <label htmlFor="answer" className="block text-sm font-medium text-slate-800">
            Your response
          </label>
        ) : null}
        <Textarea
          id="answer"
          name="answer"
          rows={4}
          required
          maxLength={2000}
          placeholder="Provide decision, unblocking guidance, or instructions..."
          aria-labelledby={labelledBy}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "answer-error" : undefined}
        />
      </div>
      {error ? (
        <p id="answer-error" role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send response"}
        </Button>
        <span className="text-xs text-slate-500">
          The response cannot be edited once dispatched to the agent.
        </span>
      </div>
    </form>
  );
}
