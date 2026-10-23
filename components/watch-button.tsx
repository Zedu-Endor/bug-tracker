"use client";

import { useOptimistic, useTransition } from "react";
import { setWatchingAction } from "@/app/actions/watch";
import { useToast } from "@/components/ui/toast";

/** Watch / Unwatch an issue (#216). */
export function WatchButton({ bugId, watching }: { bugId: string; watching: boolean }) {
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useOptimistic(watching);
  const toast = useToast();

  return (
    <button
      type="button"
      aria-pressed={shown}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const next = !shown;
          setShown(next);
          const result = await setWatchingAction(bugId, next);
          if (result.error) {
            setShown(!next);
            toast(result.error, "error");
          }
        })
      }
      title={
        shown
          ? "You get notified about comments and changes. Click to stop."
          : "Get notified about new comments and changes."
      }
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-60 ${
        shown
          ? "border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path
          fillRule="evenodd"
          d="M.66 10.59a1.65 1.65 0 0 1 0-1.19C2.08 5.83 5.73 3.25 10 3.25s7.92 2.58 9.34 6.15c.15.38.15.81 0 1.19C17.92 14.17 14.27 16.75 10 16.75S2.08 14.17.66 10.59ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
          clipRule="evenodd"
        />
      </svg>
      {shown ? "Watching" : "Watch"}
    </button>
  );
}
