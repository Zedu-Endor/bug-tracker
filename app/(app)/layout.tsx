import { headers } from "next/headers";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { isLinkPreviewBot } from "@/lib/link-preview";
import { AppHeader } from "@/components/app-header";
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
import { loadOwnAgents, loadSidebarCounts } from "@/lib/dashboard-overview";
import { pointTotals, tenantRankFor } from "@/lib/points/leaderboard";
import { getPlatformRewardConfig } from "@/lib/points/platform-rewards";
import { TARGET_POINTS } from "@/lib/points/rules";

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
  let issueCount = 0;
  let shellAgents: { id: string; name: string; level: string }[] = [];
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
    } catch (error) {
      console.error("[layout] points failed", error);
    }
    try {
      rank = (await tenantRankFor(prisma, tenantId, user.id))?.rank ?? null;
    } catch (error) {
      console.error("[layout] rank failed", error);
    }
    try {
      issueCount = (await loadSidebarCounts({ userId: user.id, tenantId })).unresolved;
    } catch (error) {
      console.error("[layout] issue count failed", error);
    }
    try {
      const agents = await loadOwnAgents({ userId: user.id, tenantId });
      shellAgents = agents.map((agent) => ({ id: agent.id, name: agent.name, level: agent.level }));
    } catch (error) {
      console.error("[layout] agents failed", error);
    }
  }

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
    <div className="flex min-h-screen flex-col bg-zk-bg lg:flex-row">
      <SkipLink />
      <AppSidebar
        issueCount={issueCount}
        workspaces={workspaces}
        activeTenantId={activeTenantId}
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
          agents={shellAgents}
          reportFormUrl={REPORT_FORM_URL}
        />
        <main
          id={MAIN_CONTENT_ID}
          /* Focusable so the skip link and the route announcer can move focus
             here; -1 keeps it out of the normal tab order. */
          tabIndex={-1}
          className="min-w-0 flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8"
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
