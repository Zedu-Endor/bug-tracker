import Link from "next/link";
import type { ReactNode } from "react";

export type PlatformTab = {
  /** A category id, `"resolved"` for resolved issues view, or `null` for All. */
  id: string | null;
  name: string;
  count: number;
  href?: string;
  active?: boolean;
  icon?: ReactNode;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * #1055: the platform is the main way to split the list (web and mobile
 * issues don't mix), so it gets a row of tabs above everything else.
 *
 * Each tab is a link: choosing one is a navigation, and the URL keeps it.
 * That makes this a navigation landmark with `aria-current`, not an ARIA
 * tablist, which is for panels switched in place.
 */
export function PlatformTabs({
  tabs,
  current,
  hrefFor,
}: {
  tabs: PlatformTab[];
  current?: string | null;
  hrefFor?: (id: string | null) => string;
}) {
  if (tabs.length <= 1) return null;
  return (
    <nav
      aria-label="Platforms"
      className="min-w-0 max-w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex min-w-max items-center gap-0.5 rounded-full bg-seg p-1">
        {tabs.map((tab) => {
          const active = tab.active ?? (tab.id === current);
          const href = tab.href ?? (hrefFor ? hrefFor(tab.id) : "#");
          return (
            <li key={tab.id ?? "all"}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-full px-3.5 text-sm transition-colors ${focusRing} ${
                  active
                    ? "bg-surface font-bold text-ink shadow-[0_1px_3px_rgba(21,18,31,0.12)]"
                    : "font-medium text-ink-2 hover:text-ink"
                }`}
              >
                {tab.icon}
                {tab.name}
                <span
                  className={`ml-1 rounded-full px-1.5 py-px text-xs font-bold tabular-nums ${
                    active ? "bg-tint text-accent" : "bg-chip-2 text-ink-2"
                  }`}
                >
                  {tab.count}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
