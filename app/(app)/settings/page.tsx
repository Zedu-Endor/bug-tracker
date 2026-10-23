import Link from "next/link";
import type { ReactNode } from "react";
import { AccountDataSettings } from "@/components/account-data-settings";
import { Avatar } from "@/components/avatar";
import { ChangePasswordForm } from "@/components/change-password-form";
import { KeyboardShortcutSettings } from "@/components/keyboard-shortcut-settings";
import { NotificationSettings } from "@/components/notification-settings";
import {
  SettingsSections,
  type SettingsSectionMeta,
} from "@/components/settings-sections";
import { ThemeSettings } from "@/components/theme-settings";
import { WalletAddressForm } from "@/components/wallet-address-form";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";
import { parseTheme } from "@/lib/theme";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { twoFactorStatus } from "@/lib/two-factor";

/* Distinct browser-tab title; the root layout appends "· Ziki". */
export const metadata = { title: "Settings" };

const CARD_BASE = "rounded-[20px] border border-line bg-surface p-6";
const CARD = `${CARD_BASE} flex flex-col gap-[18px]`;
const CARD_HEADING = "text-lg font-bold text-ink";
const CARD_HINT = "text-[13px] leading-relaxed text-muted";
const PILL =
  "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[13px] font-bold text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
const PRIMARY_PILL =
  "inline-flex items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-electric-blue-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function SectionIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="h-[17px] w-[17px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function LinkCardIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      className="h-[19px] w-[19px]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function ArrowIcon({ external = false }: { external?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 shrink-0 text-muted"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {external ? (
        <path d="M7 17 17 7M8 7h9v9" />
      ) : (
        <path d="M5 12h14M12 5l7 7-7 7" />
      )}
    </svg>
  );
}

/** A row inside one of the three link cards under Settings → Agents & API. */
function CardLink({
  href,
  label,
  external = false,
}: {
  href: string;
  label: string;
  external?: boolean;
}) {
  const className =
    "mt-1 flex min-h-10 items-center justify-between gap-3 rounded-[10px] bg-chip px-2.5 text-sm font-semibold text-ink transition-colors hover:bg-chip-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
      <ArrowIcon external />
    </a>
  ) : (
    <Link href={href} className={className}>
      {label}
      <ArrowIcon />
    </Link>
  );
}

function LinkCard({
  icon,
  title,
  body,
  children,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-[22px]">
      <div className="flex items-center gap-3">
        <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] bg-tint text-accent">
          {icon}
        </span>
        <h2 className="text-[17px] font-bold text-ink">{title}</h2>
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{body}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

/** The settings index: account, preferences, agents and data. */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ section?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const user = await requireUser();
  let settings: {
    name?: string | null;
    email?: string | null;
    theme?: string | null;
    walletAddress?: string | null;
    emailNotifications?: boolean;
    notifyMentions?: boolean;
    notifyAssignments?: boolean;
    notifyStatusChanges?: boolean;
    keyboardShortcuts?: boolean;
    passwordHash?: string | null;
  } | null = null;

  try {
    settings = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        theme: true,
        walletAddress: true,
        emailNotifications: true,
        notifyMentions: true,
        notifyAssignments: true,
        notifyStatusChanges: true,
        keyboardShortcuts: true,
        passwordHash: true,
      },
    });
  } catch (error) {
    console.error("[settings] full settings query failed, falling back to minimal fields:", error);
    try {
      settings = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          email: true,
        },
      });
    } catch (fallbackError) {
      console.error("[settings] fallback user query failed:", fallbackError);
      settings = {
        name: user.name ?? null,
        email: user.email ?? null,
      };
    }
  }

  const hasPassword = Boolean(settings?.passwordHash);
  let twoFactor = { enabled: false, backupCodesLeft: 0 };
  if (hasPassword) {
    try {
      twoFactor = await twoFactorStatus(user.id);
    } catch {
      // A missing or not-yet-migrated 2FA table must not take down Settings.
    }
  }

  const agentPlatform = isAgentPlatformEnabled();
  const displayName = settings?.name ?? user.name ?? "Unnamed";
  const email = settings?.email ?? user.email ?? "";

  const sections: SettingsSectionMeta[] = [
    {
      id: "account",
      label: "Account",
      hint: "Profile, wallet, security",
      icon: (
        <SectionIcon>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </SectionIcon>
      ),
    },
    {
      id: "preferences",
      label: "Preferences",
      hint: "Theme, emails, shortcuts",
      icon: (
        <SectionIcon>
          <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />
        </SectionIcon>
      ),
    },
    {
      id: "agents",
      label: "Agents & API",
      hint: "Agents, team, integrations",
      icon: (
        <SectionIcon>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M12 4v4M9 14h.01M15 14h.01" />
        </SectionIcon>
      ),
    },
    {
      id: "data",
      label: "Data & privacy",
      hint: "Export or delete account",
      icon: (
        <SectionIcon>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </SectionIcon>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <Link
          href="/issues"
          className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to issues
        </Link>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          Settings
        </h1>
        <p className="text-sm text-muted">Manage your profile, preferences, agents and data.</p>
      </div>

      <SettingsSections sections={sections} initialSection={params.section}>
        <div data-settings-section="account" className="flex flex-col gap-4">
          <section className={CARD}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className={CARD_HEADING}>Profile</h2>
                <span className={CARD_HINT}>How you appear to everyone in the workspace.</span>
              </div>
              <Link href={`/users/${user.id}`} className={`${PILL} h-[38px]`}>
                <svg
                  aria-hidden="true"
                  className="h-[15px] w-[15px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                See how others see you
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <Avatar
                name={displayName}
                image={user.image}
                size="xl"
                variant="brand"
                className="h-16 w-16 text-[22px]"
              />
              <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-1.5">
                <span className="text-[13px] font-bold text-ink">Display name</span>
                <div className="flex flex-wrap items-center gap-2.5">
                  <p className="flex h-[46px] min-w-0 flex-1 basis-[220px] items-center rounded-xl border border-line bg-surface px-3.5 text-sm text-ink">
                    <span className="truncate">{displayName}</span>
                  </p>
                  <Link href="/settings/profile" className={`${PRIMARY_PILL} h-[46px]`}>
                    Edit profile
                  </Link>
                </div>
                <span className="truncate text-xs text-muted">{email}</span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted">
              Shown beside your issues and comments, including ones you&apos;ve already posted. Your
              email stays the same.
            </p>
          </section>

          <section className={`${CARD_BASE} flex flex-col gap-3.5`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={CARD_HEADING}>Wallet</h2>
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <svg
                  aria-hidden="true"
                  className="h-[13px] w-[13px]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="11" width="14" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                Only you and workspace admins can see it
              </span>
            </div>
            <WalletAddressForm initialAddress={settings?.walletAddress ?? ""} />
          </section>

          <section className={`${CARD_BASE} flex flex-wrap items-center justify-between gap-4`}>
            <div className="flex items-center gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-tint text-accent">
                <svg
                  aria-hidden="true"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className={CARD_HEADING}>Two-factor sign-in</h2>
                <span className={CARD_HINT}>
                  {twoFactor.enabled
                    ? `On — ${twoFactor.backupCodesLeft} backup ${
                        twoFactor.backupCodesLeft === 1 ? "code" : "codes"
                      } left.`
                    : "Protect your account with a second step at sign-in."}
                </span>
              </div>
            </div>
            <Link href="/settings/security" className={`${PRIMARY_PILL} h-[42px]`}>
              {twoFactor.enabled ? "Manage" : "Set up"}
            </Link>
          </section>

          {hasPassword ? (
            <section className={`${CARD_BASE} flex flex-col gap-3.5`}>
              <div className="flex flex-col gap-1">
                <h2 className={CARD_HEADING}>Password</h2>
                <span className={CARD_HINT}>
                  Changing your password signs out all active sessions.
                </span>
              </div>
              <ChangePasswordForm />
            </section>
          ) : null}
        </div>

        <div data-settings-section="preferences" className="flex flex-col gap-4">
          <section className={`${CARD_BASE} flex flex-col gap-4`}>
            <div className="flex flex-col gap-1">
              <h2 className={CARD_HEADING}>Appearance</h2>
              <span className={CARD_HINT}>
                Saved to your account, so it follows you to every device.
              </span>
            </div>
            <ThemeSettings initialTheme={parseTheme(settings?.theme)} />
          </section>

          <section className={`${CARD_BASE} flex flex-col gap-3.5`}>
            <div className="flex flex-col gap-1">
              <h2 className={CARD_HEADING}>Email notifications</h2>
              <span className={CARD_HINT}>
                Sent to <strong className="font-bold text-ink">{email}</strong>. You&apos;re never
                emailed about your own changes.
              </span>
            </div>
            <NotificationSettings
              initialEnabled={settings?.emailNotifications ?? true}
              initialPrefs={{
                notifyMentions: settings?.notifyMentions ?? true,
                notifyAssignments: settings?.notifyAssignments ?? true,
                notifyStatusChanges: settings?.notifyStatusChanges ?? true,
              }}
            />
          </section>

          <section className={CARD}>
            <KeyboardShortcutSettings initialEnabled={settings?.keyboardShortcuts ?? true} />
          </section>
        </div>

        <div
          data-settings-section="agents"
          className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]"
        >
          {agentPlatform ? (
            <LinkCard
              icon={
                <LinkCardIcon>
                  <rect x="4" y="8" width="16" height="12" rx="2" />
                  <path d="M12 4v4M9 14h.01M15 14h.01" />
                </LinkCardIcon>
              }
              title="Agents"
              body="Register the AI agents that work issues for you, and see your team's."
            >
              <CardLink href="/settings/agents/connect" label="Connect your agent" />
              <CardLink href="/settings/agents/pair" label="Approve a pairing code" />
              <CardLink href="/settings/agents" label="Manage agents" />
              <CardLink href="/settings/agents/new" label="Create agent" />
              <CardLink href="/settings/webhooks" label="Webhooks" />
              <CardLink href="/settings/audit" label="Agent audit log" />
            </LinkCard>
          ) : null}

          <LinkCard
            icon={
              <LinkCardIcon>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
              </LinkCardIcon>
            }
            title="Team"
            body="Workspace members and their active agents."
          >
            <CardLink href="/settings/team" label="View team" />
          </LinkCard>

          <LinkCard
            icon={
              <LinkCardIcon>
                <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
              </LinkCardIcon>
            }
            title="API & integrations"
            body="Developer documentation, cURL references and machine-readable specs for AI agents and automated tools."
          >
            <CardLink href="/docs" label="API documentation" />
            <CardLink href="/llms.txt" label="AI specs (/llms.txt)" external />
          </LinkCard>
        </div>

        <div data-settings-section="data">
          <AccountDataSettings />
        </div>
      </SettingsSections>
    </div>
  );
}
