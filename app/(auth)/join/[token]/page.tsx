import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/local-time";
import { auth } from "@/auth";
import { selectTenantAction } from "@/app/(app)/tenants/actions";
import { requireUser } from "@/lib/auth-helpers";
import { isPasswordAuthEnabled } from "@/lib/auth-mode";
import { isInviteToken } from "@/lib/invites";
import { prisma } from "@/lib/prisma";
import { SHARE_LINK_ERRORS, previewShareLink, shareJoinPath, shareLinkAudience } from "@/lib/share-invites";
import { AutoJoin } from "./auto-join";

export const metadata: Metadata = {
  title: "Join",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const STATUS = "rounded-xl border border-warn-bd bg-warn-bg p-3 text-sm text-warn-fg";

function errorMessage(code: string | undefined): string | null {
  if (!code) return null;
  if (code in SHARE_LINK_ERRORS) return SHARE_LINK_ERRORS[code as keyof typeof SHARE_LINK_ERRORS];
  return null;
}

/**
 * Where a shareable invite link lands. Guests see the organization and sign
 * in with Google; signing in creates an account when they don't have one,
 * then attaches the organization. The link is not used until that POST.
 */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { token } = await params;
  const { error: errorParam } = await searchParams;
  const errorCode = typeof errorParam === "string" ? errorParam : undefined;
  const error = errorMessage(errorCode);

  if (!isInviteToken(token)) {
    return (
      <AuthShell title="Organization invite">
        <p role="status" className={STATUS}>
          {SHARE_LINK_ERRORS.invalid}
        </p>
      </AuthShell>
    );
  }

  const session = await auth();
  const user = session?.user ? await requireUser() : null;
  const preview = await previewShareLink(prisma, token, user ? { id: user.id } : undefined);
  const callbackUrl = shareJoinPath(token);

  if (!preview) {
    return (
      <AuthShell title="Organization invite">
        <p role="status" className={STATUS}>
          {SHARE_LINK_ERRORS.invalid}
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Join ${preview.tenant.name}`}
      description={`${preview.invitedByName} invited you to ${preview.tenant.name} on Ziki. You'll join as a member.`}
      footer={
        <Link href="/" className="font-semibold text-accent hover:underline">
          Back to homepage
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className={STATUS}>
            {error}
          </p>
        ) : null}

        {preview.alreadyMember && user ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-2">
              You&apos;re already a member of{" "}
              <strong className="font-bold text-ink">{preview.tenant.name}</strong>.
            </p>
            <form action={selectTenantAction}>
              <input type="hidden" name="tenantId" value={preview.tenant.id} />
              <Button type="submit" className="h-12 w-full rounded-full font-bold">
                Open {preview.tenant.name}
              </Button>
            </form>
          </div>
        ) : preview.state !== "open" ? (
          <p role="status" className={STATUS}>
            {SHARE_LINK_ERRORS[preview.state === "expired" ? "expired" : preview.state === "revoked" ? "revoked" : "used"]}
          </p>
        ) : user ? (
          <AutoJoin token={token} tenantName={preview.tenant.name} auto={!error} />
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-2">{shareLinkAudience(preview)}</p>
            <p className="text-sm text-ink-2">
              The link expires <LocalTime date={preview.expiresAt} />. Sign in with Google — if
              you don&apos;t have an account yet, one is created — and {preview.tenant.name} is
              added to it.
            </p>
            <GoogleSignInButton callbackUrl={callbackUrl} />
            {isPasswordAuthEnabled() ? (
              <p className="text-center text-sm text-muted">
                <Link
                  href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
                  className="font-semibold text-accent hover:underline"
                >
                  Sign in with email instead
                </Link>
              </p>
            ) : null}
          </div>
        )}
      </div>
    </AuthShell>
  );
}
