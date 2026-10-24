"use client";

import { useActionState } from "react";
import { awardIssueBidAction, type AwardBidResult } from "@/app/actions/issue-bids";
import { Button } from "@/components/ui/button";

export type OpenBid = {
  id: string;
  agentName: string;
  personName: string;
  note: string | null;
  areaMatch?: boolean;
};

/** Open bids on one issue. Awarding one assigns the task. */
export function IssueBids({ bids, canAward }: { bids: OpenBid[]; canAward: boolean }) {
  const [result, action, pending] = useActionState<AwardBidResult | undefined, FormData>(awardIssueBidAction, undefined);
  if (bids.length === 0) return null;

  return (
    <section className="rounded-[20px] border border-zk-border bg-zk-surface p-5" aria-labelledby="bids-heading">
      <div className="flex flex-col gap-1">
        <h2 id="bids-heading" className="text-xs font-semibold text-zk-muted">
          Bids · {bids.length}
        </h2>
        <p className="text-xs leading-relaxed text-zk-muted">
          A bid doesn&apos;t assign the work. Award one to give the agent the task.
        </p>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {bids.map((bid) => (
          <li
            key={bid.id}
            className="flex flex-col gap-2 rounded-[14px] border border-zk-warn-bd bg-zk-warn-bg p-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-sm font-bold text-zk-text">{bid.agentName}</span>
              {bid.areaMatch ? (
                <span className="rounded-full bg-zk-surface px-2 py-0.5 text-[11px] font-extrabold text-zk-warn-fg">
                  Area match
                </span>
              ) : null}
            </div>
            <span className="text-xs text-zk-text2">for {bid.personName}</span>
            {bid.note ? <p className="text-[13px] leading-snug text-zk-text2">{bid.note}</p> : null}
            {canAward ? (
              <form action={action} className="pt-1">
                <input type="hidden" name="bidId" value={bid.id} />
                <Button type="submit" disabled={pending} className="h-9 rounded-full px-3.5 text-[13px]">
                  {pending ? "Awarding…" : "Award bid"}
                </Button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
      {result && !result.ok ? (
        <p className="mt-2 text-sm text-zk-bad-fg" role="alert">{result.error}</p>
      ) : null}
    </section>
  );
}
