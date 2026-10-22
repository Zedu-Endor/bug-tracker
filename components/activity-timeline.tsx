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

type ActivityVisualConfig = {
  label: string;
  icon: string;
  badgeClass: string;
  dotClass: string;
};

export function getActivityVisualConfig(type: ActivityType, summary: string): ActivityVisualConfig {
  if (type === "status_changed") {
    const s = summary.toLowerCase();
    if (s.includes("in progress") || s.includes("in_progress") || s.includes("claimed")) {
      return {
        label: "Work Started",
        icon: "⚡",
        badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
        dotClass: "bg-blue-600 ring-2 ring-blue-100",
      };
    }
    if (s.includes("resolved") || s.includes("closed")) {
      return {
        label: "Resolved",
        icon: "✅",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
        dotClass: "bg-emerald-600 ring-2 ring-emerald-100",
      };
    }
    return {
      label: "Status Changed",
      icon: "🔄",
      badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
      dotClass: "bg-indigo-600 ring-2 ring-indigo-100",
    };
  }

  switch (type) {
    case "created":
      return {
        label: "Created",
        icon: "✨",
        badgeClass: "bg-teal-50 text-teal-800 border-teal-200",
        dotClass: "bg-teal-600 ring-2 ring-teal-100",
      };
    case "assignee_changed":
      return {
        label: "Assignee",
        icon: "👤",
        badgeClass: "bg-violet-50 text-violet-800 border-violet-200",
        dotClass: "bg-violet-600 ring-2 ring-violet-100",
      };
    case "commented":
      return {
        label: "Comment",
        icon: "💬",
        badgeClass: "bg-slate-100 text-slate-800 border-slate-200",
        dotClass: "bg-slate-500 ring-2 ring-slate-100",
      };
    case "severity_changed":
      return {
        label: "Severity",
        icon: "⚠️",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        dotClass: "bg-amber-600 ring-2 ring-amber-100",
      };
    case "milestone_changed":
      return {
        label: "Milestone",
        icon: "🎯",
        badgeClass: "bg-purple-50 text-purple-800 border-purple-200",
        dotClass: "bg-purple-600 ring-2 ring-purple-100",
      };
    case "boosted":
      return {
        label: "Boost",
        icon: "🚀",
        badgeClass: "bg-pink-50 text-pink-800 border-pink-200",
        dotClass: "bg-pink-600 ring-2 ring-pink-100",
      };
    case "unboosted":
      return {
        label: "Unboost",
        icon: "📉",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        dotClass: "bg-slate-400 ring-2 ring-slate-100",
      };
    case "deleted":
      return {
        label: "Deleted",
        icon: "🗑️",
        badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
        dotClass: "bg-rose-600 ring-2 ring-rose-100",
      };
    case "restored":
      return {
        label: "Restored",
        icon: "♻️",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
        dotClass: "bg-emerald-600 ring-2 ring-emerald-100",
      };
    case "comment_deleted":
      return {
        label: "Moderation",
        icon: "🛡️",
        badgeClass: "bg-rose-50 text-rose-800 border-rose-200",
        dotClass: "bg-rose-500 ring-2 ring-rose-100",
      };
    case "edited":
      return {
        label: "Edit",
        icon: "✏️",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        dotClass: "bg-slate-500 ring-2 ring-slate-100",
      };
    case "type_changed":
      return {
        label: "Type",
        icon: "🏷️",
        badgeClass: "bg-blue-50 text-blue-800 border-blue-200",
        dotClass: "bg-blue-500 ring-2 ring-blue-100",
      };
    case "category_changed":
      return {
        label: "Category",
        icon: "📁",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        dotClass: "bg-amber-500 ring-2 ring-amber-100",
      };
    case "area_changed":
      return {
        label: "Area",
        icon: "🧭",
        badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200",
        dotClass: "bg-indigo-500 ring-2 ring-indigo-100",
      };
    case "duplicate_changed":
      return {
        label: "Duplicate",
        icon: "🔗",
        badgeClass: "bg-amber-50 text-amber-800 border-amber-200",
        dotClass: "bg-amber-600 ring-2 ring-amber-100",
      };
    default:
      return {
        label: typeLabel[type] ?? "Activity",
        icon: "📋",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        dotClass: "bg-slate-400 ring-2 ring-slate-100",
      };
  }
}

export function ActivityTimeline({
  activities,
  totalCount,
}: {
  /** The newest entries, oldest first. May be fewer than `totalCount`. */
  activities: ActivityEntry[];
  /** Every entry on the issue, so the heading does not under-report. */
  totalCount?: number;
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
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Activity ({total})
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Read-only history of changes on this issue.
        </p>
        <p className="mt-4 text-sm text-slate-500">No activity recorded yet.</p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <details className="group">
        <summary className="cursor-pointer list-none select-none -m-1 rounded-md p-1 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
          <span className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Activity ({total})
            </h2>
            <span
              aria-hidden="true"
              className="shrink-0 text-slate-400 transition-transform duration-150 group-open:rotate-90"
            >
              ▸
            </span>
          </span>
          <p className="mt-1 text-xs text-slate-500">
            Read-only history of changes on this issue.
            {trimmed
              ? ` Showing the ${activities.length} most recent of ${total}.`
              : ""}
          </p>
        </summary>
        <ol className="relative mt-5 space-y-0 border-l border-slate-200 pl-4 sm:pl-5">
          {activities.map((entry) => {
            const config = getActivityVisualConfig(entry.type, entry.summary);
            return (
              <li key={entry.id} className="relative pb-5 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[1.2rem] sm:-left-[1.45rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white ${config.dotClass}`}
                />
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium border ${config.badgeClass}`}
                  >
                    <span aria-hidden="true">{config.icon}</span>
                    <span>{config.label}</span>
                  </span>
                  <LocalTime
                    className="text-xs text-slate-500"
                    date={entry.createdAt}
                  />
                </div>
                <div className="mt-1 text-sm text-slate-800">
                  <span className="font-medium text-slate-900">
                    {entry.actor.name}
                  </span>{" "}
                  <ExpandableText maxLines={2} expandText="View more" collapseText="View less">
                    {entry.summary}
                  </ExpandableText>
                </div>
                {entry.type === "status_changed" && activityNote(entry.metadata) ? (
                  <ExpandableText maxLines={3} expandText="View more" collapseText="View less">
                    <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 border-emerald-300 pl-3 text-sm text-slate-700">
                      {activityNote(entry.metadata)}
                    </blockquote>
                  </ExpandableText>
                ) : null}
              </li>
            );
          })}
        </ol>
      </details>
    </section>
  );
}
