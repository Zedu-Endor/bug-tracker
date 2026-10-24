import type { ActivityType } from "@prisma/client";
import { activityNote } from "@/lib/resolution-note";
import { LocalTime } from "@/components/local-time";
import { ExpandableText } from "@/components/expandable-text";

export type ActivityEntry = {
  id: string;
  type: ActivityType;
  summary: string;
  createdAt: Date;
  actor: { name: string };
  metadata?: unknown;
};

const typeLabel: Record<ActivityType, string> = {
  created: "Created",
  status_changed: "Status",
  severity_changed: "Severity",
  assignee_changed: "Assignee",
  commented: "Comment",
  edited: "Edit",
  milestone_changed: "Milestone",
  boosted: "Boost",
  unboosted: "Unboost",
  deleted: "Deleted",
  restored: "Restored",
  comment_deleted: "Moderation",
  type_changed: "Type",
  category_changed: "Category",
  area_changed: "Area",
  duplicate_changed: "Duplicate",
};

export function ActivityTimeline({
  activities,
  totalCount,
  expanded = false,
  showConnector = true,
}: {
  /** The newest entries, oldest first. May be fewer than `totalCount`. */
  activities: ActivityEntry[];
  /** Every entry on the issue, so the heading does not under-report. */
  totalCount?: number;
  expanded?: boolean;
  showConnector?: boolean;
}) {
  const total = totalCount ?? activities.length;
  const trimmed = total > activities.length;
  // #418: collapse the read-only history by default so long activity lists
  // stop pushing the conversation down the page. Native details/summary keeps
  // the component server-rendered, works with mouse, keyboard and without
  // JavaScript, and browsers auto-open the section when a URL targets an
  // entry inside it. Issues without activity keep the empty state visible.
  if (activities.length === 0) {
    return (
      <section className="rounded-[20px] border border-zk-border bg-zk-surface p-5">
        <h2 className="text-xs font-semibold text-zk-muted">
          Activity ({total})
        </h2>
        <p className="mt-1 text-xs text-zk-muted">
          Read-only history of changes on this issue.
        </p>
        <p className="mt-4 text-sm text-zk-muted">No activity recorded yet.</p>
      </section>
    );
  }
  return (
    <section className="rounded-[20px] border border-zk-border bg-zk-surface p-5">
      <details className="group" open={expanded}>
        <summary className="cursor-pointer list-none select-none -m-1 rounded-md p-1 hover:bg-zk-chip/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong">
          <span className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold text-zk-muted">
              Activity ({total})
            </h2>
            <span
              aria-hidden="true"
              className="shrink-0 text-zk-muted transition-transform duration-150 group-open:rotate-90"
            >
              ▸
            </span>
          </span>
          <p className="mt-1 text-xs text-zk-muted">
            Read-only history of changes on this issue.
            {trimmed
              ? ` Showing the ${activities.length} most recent of ${total}.`
              : ""}
          </p>
        </summary>
        <ol className={`relative mt-5 space-y-0 ${showConnector ? "border-l border-zk-divider pl-4 sm:pl-5" : ""}`}>
          {activities.map((entry) => (
            <li key={entry.id} className="relative pb-5 last:pb-0">
              {showConnector ? <span
                aria-hidden
                className="absolute -left-[1.2rem] sm:-left-[1.45rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-zk-surface bg-electric-blue-strong"
              /> : null}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-xs font-medium text-zk-muted">
                  {typeLabel[entry.type]}
                </span>
                <LocalTime
                  className="text-xs text-zk-muted"
                  date={entry.createdAt}
                />
              </div>
              <div className="mt-1 text-sm text-zk-text2">
                <span className="font-bold text-zk-text">
                  {entry.actor.name}
                </span>{" "}
                <ExpandableText maxLines={2} expandText="View more" collapseText="View less">
                  {entry.summary}
                </ExpandableText>
              </div>
              {entry.type === "status_changed" && activityNote(entry.metadata) ? (
                <ExpandableText maxLines={3} expandText="View more" collapseText="View less">
                  <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-[3px] border-zk-ok-fg/40 bg-zk-chip pl-3 text-sm text-zk-text2">
                    {activityNote(entry.metadata)}
                  </blockquote>
                </ExpandableText>
              ) : null}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
