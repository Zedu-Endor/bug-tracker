import Link from "next/link";
import { parseEscalationBody } from "@/lib/agent-questions";
import { LocalTime } from "@/components/local-time";
import { EscalationTypeBadge, QuickResolveButtons } from "@/app/(app)/escalations/escalation-controls";

export type TicketEscalation = {
  id: string;
  body: string;
  answer?: string | null;
  answeredAt?: Date | null;
  createdAt: Date;
  agent: {
    id?: string;
    name: string;
  };
};

export function IssueEscalations({
  escalations,
}: {
  escalations: TicketEscalation[];
}) {
  if (escalations.length === 0) {
    return null;
  }

  const pending = escalations.filter((e) => !e.answeredAt);

  return (
    <section
      id="escalations"
      aria-label="Agent escalations"
      className="scroll-mt-24 rounded-[20px] border border-line bg-surface p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider pb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
            Escalations ({escalations.length})
          </h2>
          {pending.length > 0 ? (
            <span className="inline-flex items-center rounded-full bg-warn-bg px-2.5 py-0.5 text-[11px] font-bold text-warn-fg">
              {pending.length} unresolved
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-ok-bg px-2.5 py-0.5 text-[11px] font-bold text-ok-fg">
              All resolved
            </span>
          )}
        </div>
        <Link
          href="/escalations"
          className="text-xs font-bold text-accent hover:underline"
        >
          View all workspace escalations →
        </Link>
      </div>

      <ul className="space-y-3">
        {escalations.map((esc) => {
          const parsed = parseEscalationBody(esc.body);
          const type = parsed.type;
          const isPending = !esc.answeredAt;

          return (
            <li
              key={esc.id}
              className={`rounded-[14px] border p-4 space-y-3 transition-colors ${
                isPending
                  ? "border-warn-bd bg-warn-bg/40"
                  : "border-line bg-chip/40"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <EscalationTypeBadge type={type} />
                  <span className="text-sm font-bold text-ink">
                    {esc.agent.name}
                  </span>
                  <span className="text-xs text-muted">•</span>
                  <LocalTime date={esc.createdAt} className="text-xs text-muted" />
                </div>
                {isPending ? (
                  <span className="text-xs font-bold text-warn-fg">Awaiting guidance</span>
                ) : (
                  <span className="text-xs font-bold text-ok-fg">✓ Resolved</span>
                )}
              </div>

              <p className="whitespace-pre-wrap text-sm text-ink-2">{parsed.cleanBody}</p>

              {isPending ? (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-warn-bd/60">
                  <QuickResolveButtons escalationId={esc.id} />
                  <Link
                    href={`/escalations/${esc.id}`}
                    className="text-xs font-bold text-accent hover:underline"
                  >
                    Custom response →
                  </Link>
                </div>
              ) : (
                <div className="rounded-lg bg-surface p-3 text-xs text-ink-2 border border-line space-y-1">
                  <span className="font-bold text-ink">Resolution:</span>
                  <p className="whitespace-pre-wrap">{esc.answer}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
