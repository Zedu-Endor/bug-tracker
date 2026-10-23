import Link from "next/link";
import { notFound } from "next/navigation";
import { isPasswordAuthEnabled } from "@/lib/auth-mode";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/reset-password-form";

/* Distinct browser-tab title; the root layout appends "· Ziki". */
export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (!isPasswordAuthEnabled()) notFound();

  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token.trim() : "";

  return (
    <AuthShell
      title="Set a new password"
      description="Choose a new password of at least 8 characters. Your old password will stop working immediately."
      footer={
        <>
          <Link href="/forgot-password" className="font-semibold text-accent hover:underline">
            Request a new reset link
          </Link>
          {" · "}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <p
          className="rounded-xl border border-bad-bd bg-bad-soft p-3 text-sm text-bad-fg"
          role="alert"
        >
          This reset link is invalid or incomplete. Request a new one from the forgot password
          page.
        </p>
      )}
    </AuthShell>
  );
}
