import { cookies, headers } from "next/headers";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { isLinkPreviewBot } from "@/lib/link-preview";
import { AppHeader, type HeaderAgent } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { getUnreadCount } from "@/lib/lookups";
import { REPORT_FORM_URL } from "@/lib/report-form";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/skip-link";
import { PAGE_CONTAINER_CLASS } from "@/components/page-container";
import { FocusMainOnNavigate } from "@/components/focus-main-on-navigate";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { isAdmin } from "@/lib/roles";
import type { WorkspaceChoice } from "@/components/workspace-switcher";
import { prisma } from "@/lib/prisma";
import { currentTenantIdFor } from "@/lib/tenant-context";
import { tenantsForUser } from "@/lib/tenants";
import { countPendingEscalations } from "@/lib/agent-questions";
import { pointTotals, tenantRankFor } from "@/lib/points/leaderboard";
import { loadOwnAgents, loadSidebarCounts } from "@/lib/dashboard-overview";
import { getPlatformRewardConfig } from "@/lib/points/platform-rewards";
import { TARGET_POINTS } from "@/lib/points/rules";
import { SIDEBAR_COOKIE, parseSidebarCollapsed } from "@/lib/sidebar";
import { headerNavItems } from "@/lib/header-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Link-preview crawlers may reach /bugs/[id] without a session. Render a
  // minimal shell so generateMetadata + the public preview body can respond.
  if (!session?.user) {
    const ua = (await headers()).get("user-agent");
    if (isLinkPreviewBot(ua)) {
      return (
        <div className="flex min-h-screen flex-col bg-background">
          <main
            id={MAIN_CONTENT_ID}
            className={`${PAGE_CONTAINER_CLASS} flex-1 py-8`}
          >
            {children}
          </main>
        </div>
      );
    }
  }

  const user = await requireUser();
  // The header lists this person's workspaces. Pages still resolve the active
  // project inside the current workspace, so a foreign project id is ignored.
  let workspaces: WorkspaceChoice[] = [];
  let activeTenantId: string | null = null;
  let tenantId: string | null = null;
  try {
    tenantId = await currentTenantIdFor(user.id);
    activeTenantId = tenantId;
    const memberships = await tenantsForUser(prisma, user.id);
    workspaces = memberships
      .filter((tenant) => tenant.archivedAt === null)
      .map((tenant) => ({ id: tenant.id, name: tenant.name, slug: tenant.slug }));
  } catch (error) {
    console.error("[layout] workspace context failed", error);
  }
  // A missing Notification table must not take down every signed-in page.
  let unreadCount = 0;
  try {
    // Cached per user and expired by every write that changes it (#317), so
    // ordinary navigation doesn't pay for a count query.
    unreadCount = await getUnreadCount(user.id);
  } catch (error) {
    console.error("[layout] notification count failed", error);
  }

  let pendingEscalationsCount = 0;
  let points = 0;
  let solvedTasks = 0;
  let rank: number | null = null;
  let sidebarUnresolved = 0;
  let agents: HeaderAgent[] = [];
  let targetPoints = TARGET_POINTS;
  try {
    targetPoints = (await getPlatformRewardConfig(prisma)).target;
  } catch (error) {
    console.error("[layout] platform rewards failed", error);
  }
  if (tenantId) {
    try {
      pendingEscalationsCount = await countPendingEscalations(user.id, tenantId);
    } catch (error) {
      console.error("[layout] pending escalations count failed", error);
    }
    try {
      const totals = await pointTotals(prisma, tenantId, user.id);
      points = totals.points;
      solvedTasks = totals.solvedTasks;
      const place = await tenantRankFor(prisma, tenantId, user.id);
      rank = place?.rank ?? null;
    } catch (error) {
      console.error("[layout] points failed", error);
    }
    try {
      sidebarUnresolved = (await loadSidebarCounts({ userId: user.id, tenantId })).unresolved;
    } catch (error) {
      console.error("[layout] sidebar counts failed", error);
    }
    try {
      agents = (await loadOwnAgents({ userId: user.id, tenantId })).map((agent) => ({
        id: agent.id,
        name: agent.name,
        level: agent.level as HeaderAgent["level"],
      }));
    } catch (error) {
      console.error("[layout] agents failed", error);
    }
  }

  const sidebarCollapsed = parseSidebarCollapsed(
    (await cookies()).get(SIDEBAR_COOKIE)?.value,
  );
  // The design keeps the sidebar to the three core destinations. Anything
  // role-specific that has no other home in the shell rides in "More".
  const sidebarExtras = headerNavItems(user.role, { agentPlatform: true }).filter(
    (item) => item.href === "/admin/users",
  );

  // #287: one primary-key read; a failure leaves shortcuts on, the default.
  let shortcutsEnabled = true;
  try {
    const prefs = await prisma.user.findUnique({
      where: { id: user.id },
      select: { keyboardShortcuts: true },
    });
    shortcutsEnabled = prefs?.keyboardShortcuts ?? true;
  } catch (error) {
    console.error("[layout] shortcut setting failed", error);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <SkipLink />
      <AppSidebar
        counts={{ unresolved: sidebarUnresolved }}
        workspaces={workspaces}
        activeTenantId={activeTenantId}
        extraItems={sidebarExtras}
        initialCollapsed={sidebarCollapsed}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          userName={user.name ?? user.email}
          userImage={user.image}
          role={user.role}
          isRealSuperAdmin={user.isRealSuperAdmin}
          isRealAdmin={user.isRealAdmin}
          unreadCount={unreadCount}
          pendingEscalationsCount={pendingEscalationsCount}
          userId={user.id}
          workspaces={workspaces}
          activeTenantId={activeTenantId}
          points={points}
          solvedTasks={solvedTasks}
          targetPoints={targetPoints}
          rank={rank}
          agents={agents}
          reportFormUrl={REPORT_FORM_URL}
        />
        <main
          id={MAIN_CONTENT_ID}
          /* Focusable so the skip link and the route announcer can move focus
             here; -1 keeps it out of the normal tab order. */
          tabIndex={-1}
          className={`outline-none ${PAGE_CONTAINER_CLASS} flex-1 pb-10 pt-[64px] sm:px-6 sm:pb-12 sm:pt-8`}
        >
          {children}
        </main>
      </div>
      <FocusMainOnNavigate />
      <KeyboardShortcuts
        enabled={shortcutsEnabled}
        dashboard={isAdmin(user.role)}
      />
    </div>
  );
}
