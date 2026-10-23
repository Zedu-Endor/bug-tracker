import { isSuperAdmin, type AppRole } from "@/lib/roles";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";

export type HeaderNavSubItem = {
  href: string;
  label: string;
  description?: string;
  badge?: number;
};

export type HeaderNavItem = {
  href: string;
  label: string;
  badge?: number;
  children?: HeaderNavSubItem[];
};

/** #444: pick another tenant, create one, or accept an invite. */
export const SWITCH_TENANT_LINK: HeaderNavItem = { href: "/tenants", label: "Switch workspace" };

/** The Agents dropdown in the top bar. */
export const AGENT_MENU_LINKS: HeaderNavItem[] = [
  { href: "/settings/agents/connect", label: "Get started" },
  { href: "/settings/agents", label: "Manage agents" },
];

/** Links shown in the header for the role the user is currently viewing as (#761). */
export function headerNavItems(
  role?: AppRole | null,
  options?: { agentPlatform?: boolean; pendingEscalations?: number },
): HeaderNavItem[] {
  const pending =
    typeof options?.pendingEscalations === "number" && options.pendingEscalations > 0
      ? options.pendingEscalations
      : undefined;

  const items: HeaderNavItem[] = [
    // Post-login landing: the workspace overview.
    { href: "/dashboard", label: "Overview" },
    { href: "/issues", label: "Issues" },
  ];

  if (options?.agentPlatform ?? isAgentPlatformEnabled()) {
    items.push({
      href: "/escalations",
      label: "Escalations",
      ...(pending ? { badge: pending } : {}),
    });
  } else {
    items.push({ href: "/docs", label: "API Docs" });
  }

  if (isSuperAdmin(role)) {
    items.push({ href: "/admin/users", label: "Admins" });
  }

  return items;
}

/**
 * Whether a header link is the current page. "Issues" covers the list and
 * individual issues, but not the "New issue" form, which has its own button.
 */
export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const path = pathname.replace(/\/+$/, "") || "/";
  // Profile has its own account-menu entry rather than sharing Settings' highlight.
  if (href === "/settings") {
    return (
      (path === "/settings" || path.startsWith("/settings/")) &&
      path !== "/settings/profile" &&
      !path.startsWith("/settings/profile/")
    );
  }
  if (href === "/issues" || href === "/bugs") {
    return (
      path === "/issues" ||
      path === "/bugs" ||
      ((path.startsWith("/issues/") || path.startsWith("/bugs/")) &&
        path !== "/issues/new" &&
        path !== "/bugs/new")
    );
  }
  if (href === "/escalations" || href === "/questions") {
    return (
      path === "/escalations" ||
      path.startsWith("/escalations/") ||
      path === "/questions" ||
      path.startsWith("/questions/") ||
      path === "/redesigns" ||
      path.startsWith("/redesigns/")
    );
  }
  if (href === "/manage-project") {
    return (
      path === "/projects" ||
      path.startsWith("/projects/") ||
      path === "/milestones" ||
      path.startsWith("/milestones/") ||
      path === "/admin/categories" ||
      path.startsWith("/admin/categories/") ||
      path === "/admin/types" ||
      path.startsWith("/admin/types/")
    );
  }
  return path === href || path.startsWith(`${href}/`);
}

/** The role a user really has, before any "View as" override. */
export function realRoleOf(flags: {
  isRealSuperAdmin?: boolean;
  isRealAdmin?: boolean;
}): AppRole {
  if (flags.isRealSuperAdmin) return "super_admin";
  if (flags.isRealAdmin) return "admin";
  return "user";
}

export const roleViewLabels: Record<AppRole, string> = {
  super_admin: "Super admin",
  admin: "Team lead (admin)",
  user: "Normal user",
};

/** Up to two initials for the account button, e.g. "Bob Builder" → "BB". */
export function initialsOf(name?: string | null): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const base = clean.includes("@") ? clean.split("@")[0] : clean;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}
