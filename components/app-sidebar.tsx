"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ZikiWordmark } from "@/components/brand-lockup";
import { WorkspaceSwitcher, type WorkspaceChoice } from "@/components/workspace-switcher";
import { isNavItemActive, type HeaderNavItem } from "@/lib/header-nav";
import { sidebarCookie } from "@/lib/sidebar";

/**
 * The persistent app sidebar (redesign handoff, "App shell"). Navy in both
 * themes. Overview, Issues and Team, then this person's own work, then any
 * extra destinations their role adds (API Docs, Admins). Every count is a
 * live workspace-wide number whose destination shows the same set.
 *
 * At lg and up it is a full-height column that collapses to an icon rail.
 * Below lg it stacks above the page: logo and workspace, then the links as
 * one horizontally scrolling row.
 */
export type AppSidebarCounts = {
  unresolved: number;
};

const ICONS = {
  overview: "M3 4.5A1.5 1.5 0 0 1 4.5 3h4A1.5 1.5 0 0 1 10 4.5v6A1.5 1.5 0 0 1 8.5 12h-4A1.5 1.5 0 0 1 3 10.5zM14 4.5A1.5 1.5 0 0 1 15.5 3h4A1.5 1.5 0 0 1 21 4.5v2A1.5 1.5 0 0 1 19.5 8h-4A1.5 1.5 0 0 1 14 6.5zM14 13.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5zM3 17.5A1.5 1.5 0 0 1 4.5 16h4a1.5 1.5 0 0 1 1.5 1.5v2A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5z",
  issues: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  docs: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5",
  admin: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
} as const;

type IconName = keyof typeof ICONS;

function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="h-[19px] w-[19px] shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-tint focus-visible:ring-offset-2 focus-visible:ring-offset-deep-ocean";

function SidebarLink({
  href,
  label,
  icon,
  count,
  active = false,
  collapsed,
}: {
  href: string;
  label: string;
  icon: IconName;
  count?: number;
  active?: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={`flex min-h-11 shrink-0 items-center gap-3 rounded-[14px] px-4 text-[15px] transition-colors motion-reduce:transition-none ${focusRing} ${
        collapsed ? "lg:justify-center lg:px-0" : ""
      } ${
        active
          ? "bg-primary font-bold text-white shadow-[0_8px_22px_rgba(57,120,246,0.45)]"
          : "font-medium text-sidebar-ink hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <NavIcon name={icon} />
      <span className={`whitespace-nowrap lg:flex-1 ${collapsed ? "lg:sr-only" : ""}`}>{label}</span>
      {typeof count === "number" ? (
        <span
          className={`rounded-full px-2 text-xs font-semibold tabular-nums leading-5 ${collapsed ? "lg:hidden" : ""} ${
            active ? "bg-white/[0.18] text-deep-ocean" : "bg-white/[0.18] text-sidebar-ink"
          }`}
        >
          <span className="sr-only">, </span>
          {count > 999 ? "999+" : count}
        </span>
      ) : null}
    </Link>
  );
}

function GroupLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  return (
    <p
      className={`mb-1 mt-3 hidden px-4 text-[11px] font-bold uppercase tracking-[0.08em] text-sidebar-muted ${
        collapsed ? "" : "lg:block"
      }`}
    >
      {children}
    </p>
  );
}

const EXTRA_ICONS: Record<string, IconName> = {
  "/docs": "docs",
  "/admin/users": "admin",
};

export function AppSidebar({
  counts,
  workspaces,
  activeTenantId,
  extraItems = [],
  initialCollapsed = false,
}: {
  counts: AppSidebarCounts;
  workspaces: WorkspaceChoice[];
  activeTenantId: string | null;
  /** Role-dependent destinations beyond the core three (API Docs, Admins). */
  extraItems?: HeaderNavItem[];
  /** From the collapse cookie, so the first paint has the right width. */
  initialCollapsed?: boolean;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = sidebarCookie(next);
  };

  return (
    <aside
      aria-label="Sidebar"
      data-collapsed={collapsed ? "true" : undefined}
      className={`w-full flex shrink-0 flex-col gap-4 bg-deep-ocean px-4 py-4 text-sidebar-ink lg:sticky lg:top-0 lg:h-dvh lg:gap-[18px] lg:overflow-y-auto lg:py-[22px] ${
        collapsed ? "lg:w-[76px] lg:px-3" : "lg:w-[248px]"
      }`}
    >
      <div className={`flex items-center justify-between gap-3 px-2 ${collapsed ? "lg:flex-col lg:px-0" : ""}`}>
        <Link href="/dashboard" aria-label="Ziki overview" className={`rounded-md ${focusRing}`}>
          {/* The rail shows the mark; the wordmark never fits 76px. */}
          <span className={collapsed ? "block lg:hidden" : "block"}>
            <ZikiWordmark tone="onDark" />
          </span>
          <span className={collapsed ? "hidden lg:block" : "hidden"}>
            <ZikiWordmark collapsed />
          </span>
        </Link>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`hidden h-[30px] w-[30px] items-center justify-center rounded-full border border-sidebar-line text-[#c9d6ef] transition-colors hover:bg-white/[0.06] hover:text-white lg:flex ${focusRing}`}
        >
          <svg
            className={`h-3.5 w-3.5 ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      <div className={collapsed ? "lg:hidden" : ""}>
        <WorkspaceSwitcher workspaces={workspaces} activeTenantId={activeTenantId} tone="sidebar" />
      </div>

      <nav
        aria-label="Workspace"
        className="min-w-0 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
      >
        <SidebarLink
          href="/dashboard"
          label="Overview"
          icon="overview"
          active={isNavItemActive(pathname, "/dashboard")}
          collapsed={collapsed}
        />
        <div aria-hidden="true" className="mx-3 my-1.5 hidden h-px bg-[#1e2e52] lg:block" />
        <SidebarLink
          href="/issues?project=all"
          label="Issues"
          icon="issues"
          count={counts.unresolved}
          active={isNavItemActive(pathname, "/issues")}
          collapsed={collapsed}
        />
        <SidebarLink
          href="/settings/team"
          label="Team"
          icon="team"
          active={isNavItemActive(pathname, "/settings/team")}
          collapsed={collapsed}
        />

        {extraItems.length > 0 ? (
          <>
            <GroupLabel collapsed={collapsed}>More</GroupLabel>
            {extraItems.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={EXTRA_ICONS[item.href] ?? "docs"}
                count={item.badge}
                active={isNavItemActive(pathname, item.href)}
                collapsed={collapsed}
              />
            ))}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
