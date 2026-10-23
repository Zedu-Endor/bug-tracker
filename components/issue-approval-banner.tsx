"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BASE_PATH } from "@/lib/base-path";

export type IssueApprovalView = {
  id: string;
  stage: string;
  status: string;
  rule?: {
    issueType?: { name: string } | null;
    severity?: string | null;
    fileGlob?: string | null;
  } | null;
};

export function IssueApprovalBanner({
  approval,
  canDecide,
}: {
  approval: IssueApprovalView;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleDecision(decision: "approved" | "rejected") {
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        `${BASE_PATH}/api/v1/approvals/${encodeURIComponent(approval.id)}/decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? `Could not save decision (${decision}).`);
      }
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Decision failed.");
    } finally {
      setPending(false);
    }
  }

  const stageLabel =
    approval.stage === "before_merge"
      ? "before its pull request is merged"
      : "before it can be offered to agents";

  const ruleReasons: string[] = [];
  if (approval.rule?.issueType?.name) {
    ruleReasons.push(`type: ${approval.rule.issueType.name}`);
  }
  if (approval.rule?.severity) {
    ruleReasons.push(`severity: ${approval.rule.severity}`);
  }
  if (approval.rule?.fileGlob) {
    ruleReasons.push(`files matching: ${approval.rule.fileGlob}`);
  }

  return (
    <section
      aria-label="Human approval required"
      className="flex flex-col gap-3 rounded-[20px] border border-warn-bd bg-warn-bg p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            ⚠️
          </span>
          <h2 className="text-sm font-bold text-warn-fg">
            Human approval required
          </h2>
        </div>
        <p className="text-sm text-warn-fg">
          This issue requires workspace approval {stageLabel}.
          {ruleReasons.length ? (
            <span className="ml-1 text-xs opacity-80">
              ({ruleReasons.join(", ")})
            </span>
          ) : null}
        </p>
        {error ? (
          <p role="alert" className="text-xs font-bold text-bad-fg">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {canDecide ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleDecision("approved")}
              className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-electric-blue-strong disabled:opacity-50"
            >
              {pending ? "Saving…" : "Approve"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => handleDecision("rejected")}
              className="inline-flex items-center justify-center rounded-full border border-line bg-surface px-4 py-2 text-xs font-bold text-ink-2 shadow-xs hover:bg-chip disabled:opacity-50"
            >
              {pending ? "Saving…" : "Reject"}
            </button>
          </>
        ) : (
          <span className="text-xs italic text-warn-fg">
            Waiting for workspace owner or admin decision
          </span>
        )}
      </div>
    </section>
  );
}
