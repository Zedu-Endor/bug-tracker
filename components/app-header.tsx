"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AgentLevel } from "@prisma/client";
import { SignOutButton } from "@/components/sign-out-button";
import type { WorkspaceChoice } from "@/components/workspace-switcher";
import { RoleSwitcher } from "@/components/role-switcher";
import {
  AGENT_MENU_LINKS,
  SWITCH_TENANT_LINK,
  headerNavItems,
  isNavItemActive,
  realRoleOf,
  roleViewLabels,
} from "@/lib/header-nav";
import { isAdmin, type AppRole } from "@/lib/roles";
import { Avatar } from "@/components/avatar";
import { ThemeToggle, AccountThemeSelector } from "@/components/theme-toggle";
import { TARGET_POINTS } from "@/lib/points/rules";
import { AGENT_LEVEL_LABELS } from "@/lib/agents/levels";
import { AGENT_LEVEL_TONE } from "@/lib/agents/level-tone";

/** Focus ring for controls on the top bar and its menus. */
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/** A round 40px top-bar button (theme, bell). */
const roundButton = `relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-tint ${focusRing}`;

/** One of this person's agents, for the Agents dropdown. */
export type HeaderAgent = {
  id: string;
  name: string;
  level: AgentLevel;
};

/** Closes a popover on outside click or Escape, returning focus to its trigger. */
function useDismiss(
  open: boolean,
  close: () => void,
  containerRef: React.RefObject<HTMLElement | null>,
  triggerRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, containerRef, triggerRef]);
}

function Icon({ path, className = "h-4 w-4" }: { path: string; className?: string }) {
  return (
    <svg
      className={`shrink-0 ${className}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS = {
  trophy:
    "M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2-1.2.5-2 2-2 3.8M14 14.7V17c0 .6.5 1 1 1.2 1.2.5 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0V2Z",
  warning: "m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3ZM12 9v4M12 17h.01",
  robot: "M4 8h16v12H4zM12 4v4M9 14h.01M15 14h.01",
  chevronDown: "m6 9 6 6 6-6",
  chevronUp: "m18 15-6-6-6 6",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  plus: "M12 5v14M5 12h14",
  swap: "m16 3 4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  docs: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15zM6.5 17A2.5 2.5 0 0 0 4 19.5 2.5 2.5 0 0 0 6.5 22H20v-5",
  dashboard: "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  external: "M7 17 17 7M8 7h9v9",
  signOut: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
} as const;

/** Bell linking to the notification feed, with the unread count (#216). */
function NotificationsBell({ unreadCount, active }: { unreadCount: number; active: boolean }) {
  const label =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={`${roundButton} ${active ? "border-primary" : ""}`}
    >
      <Icon path={ICONS.bell} className="h-[18px] w-[18px]" />
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-surface bg-primary px-1 text-[11px] font-bold leading-none text-white"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}

/** This person's points in the open workspace, linking to their profile. */
function PointsPill({
  points,
  solvedTasks,
  userId,
  targetPoints = TARGET_POINTS,
}: {
  points: number;
  solvedTasks: number;
  userId?: string | null;
  targetPoints?: number;
}) {
  if (!userId) return null;
  const label = `${points} pts of ${targetPoints}, ${solvedTasks} solved`;
  return (
    <Link
      href={`/users/${userId}`}
      title={label}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-sm text-ink transition-colors hover:bg-tint ${focusRing}`}
    >
      <span className="text-primary">
        <Icon path={ICONS.trophy} />
      </span>
      <span className="font-extrabold tabular-nums">{points}</span>
      <span className="text-muted">pts</span>
      <span className="sr-only"> of {targetPoints}, {solvedTasks} solved</span>
    </Link>
  );
}

/** The red-tinted Escalations button, with the number waiting on this person (#763). */
function EscalationsButton({
  href,
  label,
  badge,
  active,
}: {
  href: string;
  label: string;
  badge?: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-bad-bd bg-bad-soft px-3 text-sm font-bold text-bad-fg transition-colors hover:bg-bad-bg sm:px-4 ${focusRing}`}
    >
      <Icon path={ICONS.warning} />
      <span>{label}</span>
      {typeof badge === "number" && badge > 0 ? (
        <span
          aria-label={`${badge} pending`}
          className="inline-flex min-w-5 items-center justify-center rounded-full bg-bad-fg px-1.5 py-0.5 text-[11px] font-bold leading-none text-surface"
        >
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The Agents dropdown: this person's agents in the open workspace, then
 * Create agent, Manage agents and the pairing approval.
 */
function AgentsMenu({ agents, pathname }: { agents: HeaderAgent[]; pathname: string | null }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  useDismiss(open, () => setOpen(false), containerRef, buttonRef);
  // The agent pages nest, so match the exact path rather than a prefix;
  // otherwise every entry would claim to be the current page.
  const current = (pathname ?? "").replace(/\/+$/, "");
  const [createLink, ...otherLinks] = AGENT_MENU_LINKS;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="agents-nav-menu"
        onClick={() => setOpen((value) => !value)}
        className={`inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface pl-4 pr-3.5 text-sm font-semibold text-ink transition-colors hover:bg-tint ${focusRing}`}
      >
        <span className="text-primary">
          <Icon path={ICONS.robot} />
        </span>
        <span>Agents</span>
        <Icon path={ICONS.chevronDown} className={`h-3.5 w-3.5 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          id="agents-nav-menu"
          className="absolute right-0 top-12 z-50 flex w-[260px] max-w-[calc(100vw-32px)] flex-col gap-0.5 rounded-2xl border border-line bg-surface p-2 shadow-pop motion-safe:animate-[header-pop_120ms_ease-out]"
        >
          <p className="px-2.5 pb-1.5 pt-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Your agents
          </p>
          {agents.length === 0 ? (
            <p className="px-2.5 pb-2 text-sm text-muted">No agents yet.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {agents.map((agent) => (
                <li key={agent.id}>
                  <Link
                    href={`/settings/agents#agent-${agent.id}`}
                    onClick={() => setOpen(false)}
                    className={`flex min-h-11 items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm text-ink transition-colors hover:bg-tint ${focusRing}`}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-tint text-xs font-extrabold text-accent"
                    >
                      {agent.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold">{agent.name}</span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${AGENT_LEVEL_TONE[agent.level]}`}
                    >
                      {AGENT_LEVEL_LABELS[agent.level]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div aria-hidden="true" className="my-1 h-px bg-divider" />
          <Link
            href={createLink.href}
            onClick={() => setOpen(false)}
            className={`flex min-h-11 items-center gap-2 rounded-[10px] px-2.5 text-sm font-bold text-accent transition-colors hover:bg-tint ${focusRing}`}
          >
            <Icon path={ICONS.plus} />
            {createLink.label}
          </Link>
          {otherLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              aria-current={current === link.href ? "page" : undefined}
              className={`flex min-h-10 items-center rounded-[10px] px-2.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-tint hover:text-ink ${focusRing}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({
  href,
  active,
  icon,
  trailing,
  external = false,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  icon: string;
  trailing?: React.ReactNode;
  external?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const className = `flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${focusRing} ${
    active ? "bg-tint text-accent" : "text-ink hover:bg-tint"
  }`;
  const content = (
    <>
      <span className={active ? "text-accent" : "text-ink-2"}>
        <Icon path={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="flex-1">{children}</span>
      {trailing}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={className}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} aria-current={active ? "page" : undefined} onClick={onClick} className={className}>
      {content}
    </Link>
  );
}

function OnlineDot({ ring }: { ring: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 bg-[#22c55e] ${ring}`}
    />
  );
}

export function AppHeader({
  userName,
  userImage,
  role,
  isRealSuperAdmin,
  isRealAdmin,
  unreadCount = 0,
  pendingEscalationsCount = 0,
  userId,
  workspaces = [],
  activeTenantId = null,
  points = 0,
  solvedTasks = 0,
  targetPoints = TARGET_POINTS,
  rank = null,
  agents = [],
  reportFormUrl,
}: {
  userName?: string | null;
  /** Their picture, if their sign-in provider gave one (#290). */
  userImage?: string | null;
  role?: AppRole | null;
  isRealSuperAdmin?: boolean;
  isRealAdmin?: boolean;
  /** Unread in-app notifications (#216). */
  unreadCount?: number;
  /** Unresolved escalations from agents (#763). */
  pendingEscalationsCount?: number;
  userId?: string | null;
  /** Workspaces this person can open, and the one currently active. */
  workspaces?: WorkspaceChoice[];
  activeTenantId?: string | null;
  /** This person's points in the open workspace. */
  points?: number;
  solvedTasks?: number;
  /** Platform points goal (hard-coded fallback when unset). */
  targetPoints?: number;
  /** Their place on the workspace leaderboard; null when they have no points yet. */
  rank?: number | null;
  /** Their own agents in the open workspace, for the Agents dropdown. */
  agents?: HeaderAgent[];
  /** The external "Report issue" form, when configured (REPORT_FORM_URL). */
  reportFormUrl?: string;
}) {
  const pathname = usePathname();
  const [accountOpen, setAccountOpen] = useState(false);

  const accountRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  const closeAccount = () => setAccountOpen(false);
  useDismiss(accountOpen, closeAccount, accountRef, accountButtonRef);

  // Close menus when the page changes (state adjusted during render, not in an effect).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setAccountOpen(false);
  }

  // The bar keeps only Escalations; the rest of the nav lives in the sidebar.
  const escalations = headerNavItems(role, {
    pendingEscalations: pendingEscalationsCount,
  }).find((item) => item.href === "/escalations");
  const canSwitchRole = Boolean((isRealSuperAdmin || isRealAdmin) && role);
  const realRole = realRoleOf({ isRealSuperAdmin, isRealAdmin });
  const effectiveRole: AppRole = role ?? "user";
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeTenantId) ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface">
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <PointsPill
          points={points}
          solvedTasks={solvedTasks}
          userId={userId}
          targetPoints={targetPoints}
        />

        {escalations ? (
          <EscalationsButton
            href={escalations.href}
            label={escalations.label}
            badge={escalations.badge}
            active={isNavItemActive(pathname, escalations.href)}
          />
        ) : null}

        <AgentsMenu agents={agents} pathname={pathname} />

        <ThemeToggle />

        <NotificationsBell
          unreadCount={unreadCount}
          active={isNavItemActive(pathname, "/notifications")}
        />

        <div ref={accountRef} className="relative shrink-0">
          <button
            ref={accountButtonRef}
            type="button"
            aria-haspopup="true"
            aria-expanded={accountOpen}
            aria-controls="account-menu"
            onClick={() => setAccountOpen((open) => !open)}
            className={`flex h-11 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-ink transition-colors hover:bg-tint ${focusRing} ${
              accountOpen ? "border-primary" : "border-transparent"
            }`}
          >
            <span className="sr-only">Account menu for {userName}</span>
            <span className="relative inline-flex">
              <Avatar name={userName} image={userImage} size="lg" variant="brand" className="h-[38px]! w-[38px]!" />
              <OnlineDot ring="border-surface" />
            </span>
            <Icon path={accountOpen ? ICONS.chevronUp : ICONS.chevronDown} className="h-3.5 w-3.5" />
          </button>

          {accountOpen ? (
            <div
              id="account-menu"
              className="absolute right-0 top-[54px] z-50 flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-1 rounded-[20px] border border-line bg-surface p-2 shadow-pop motion-safe:animate-[header-pop_120ms_ease-out]"
            >
              <div className="flex items-center gap-3 rounded-[14px] bg-tint p-3">
                <span className="relative inline-flex">
                  <Avatar name={userName} image={userImage} size="lg" variant="brand" className="h-12! w-12! text-base!" />
                  <OnlineDot ring="border-tint" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="truncate text-base font-extrabold text-ink">{userName}</p>
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-ink-2">
                      {realRole === "user" ? "Member" : roleViewLabels[realRole]}
                    </span>
                    <span className="text-xs font-semibold text-accent">
                      {points} pts{typeof rank === "number" ? ` · #${rank}` : ""}
                    </span>
                  </p>
                </div>
              </div>

              {canSwitchRole ? (
                <div className="px-3 py-2">
                  <RoleSwitcher activeRole={effectiveRole} isSuperAdmin={isRealSuperAdmin} />
                </div>
              ) : null}

              <AccountThemeSelector />

              <div aria-hidden="true" className="mx-2 my-0.5 h-px bg-divider" />

              <MenuLink
                href={SWITCH_TENANT_LINK.href}
                active={isNavItemActive(pathname, SWITCH_TENANT_LINK.href)}
                icon={ICONS.swap}
                trailing={
                  activeWorkspace ? (
                    <span className="max-w-24 truncate rounded-full bg-chip px-2 py-0.5 text-xs font-bold text-ink-2">
                      {activeWorkspace.name}
                    </span>
                  ) : null
                }
              >
                {SWITCH_TENANT_LINK.label}
              </MenuLink>
              <MenuLink
                href="/leaderboard"
                active={isNavItemActive(pathname, "/leaderboard")}
                icon={ICONS.trophy}
              >
                Leaderboard
              </MenuLink>
              <MenuLink
                href="/settings/profile"
                active={isNavItemActive(pathname, "/settings/profile")}
                icon={ICONS.user}
              >
                Profile
              </MenuLink>
              <MenuLink href="/settings" active={isNavItemActive(pathname, "/settings")} icon={ICONS.settings}>
                Settings
              </MenuLink>
              {isAdmin(effectiveRole) ? (
                <MenuLink
                  href="/admin/dashboard"
                  active={isNavItemActive(pathname, "/admin/dashboard")}
                  icon={ICONS.dashboard}
                >
                  Dashboard
                </MenuLink>
              ) : null}
              {reportFormUrl ? (
                <MenuLink href={reportFormUrl} active={false} icon={ICONS.flag} external onClick={closeAccount}>
                  Report issue
                </MenuLink>
              ) : null}
              <MenuLink
                href="/docs"
                active={isNavItemActive(pathname, "/docs")}
                icon={ICONS.docs}
                trailing={
                  <span className="text-muted">
                    <Icon path={ICONS.external} className="h-3.5 w-3.5" />
                  </span>
                }
              >
                Docs & /llms.txt
              </MenuLink>

              <div aria-hidden="true" className="mx-2 my-0.5 h-px bg-divider" />

              <SignOutButton
                userId={userId}
                tone="danger"
                className={focusRing}
                icon={<Icon path={ICONS.signOut} className="h-[18px] w-[18px]" />}
              />
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
