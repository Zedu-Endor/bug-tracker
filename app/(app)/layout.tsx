import { headers } from "next/headers";
import { ReportIssueFab } from "@/components/report-issue-fab";
import { auth } from "@/auth";
import { requireUser } from "@/lib/auth-helpers";
import { isLinkPreviewBot } from "@/lib/link-preview";
import { AppHeader } from "@/components/app-header";
import { REPORT_FORM_URL } from "@/lib/report-form";

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
        <div className="flex min-h-screen flex-col bg-slate-50">
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
            {children}
          </main>
        </div>
      );
    }
  }

  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <AppHeader
        userName={user.name ?? user.email}
        role={user.role}
        isRealSuperAdmin={user.isRealSuperAdmin}
        isRealAdmin={user.isRealAdmin}
      />
      <main className="mx-auto w-full max-w-5xl flex-1 px-3.5 py-5 sm:px-4 sm:py-8">
        {children}
      </main>
      <ReportIssueFab href={REPORT_FORM_URL} />
    </div>
  );
}
