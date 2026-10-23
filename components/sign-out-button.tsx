"use client";

import { useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { clearUserDrafts } from "@/lib/form-drafts";
import { isRedirectError } from "@/lib/toast-store";

type SignOutButtonProps = {
  userId?: string | null;
  className?: string;
  /** "danger" is the red menu row in the redesign's account menu. */
  tone?: "default" | "danger";
  /** Shown before the label, e.g. the account menu's sign-out icon. */
  icon?: React.ReactNode;
};

/**
 * Signs the person out, but only after they confirm (#419).
 *
 * The previous `<form action={logoutAction}>` signed out immediately on
 * click, with no chance to cancel. This asks first, then clears the person's
 * drafts and calls the logout action, which redirects to /login.
 */
export function SignOutButton({
  userId,
  className = "",
  tone = "default",
  icon,
}: SignOutButtonProps) {
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();

  const handleSignOut = async () => {
    const confirmed = await confirm({
      title: "Sign out?",
      body:
        "You'll be signed out of your account and redirected to the sign-in page.",
      confirmLabel: "Sign out",
      tone: "danger",
    });
    if (!confirmed) return;

    startTransition(async () => {
      try {
        clearUserDrafts(userId);
        await logoutAction();
      } catch (err) {
        // signOut() throws a NEXT_REDIRECT to /login; let Next.js navigate.
        if (isRedirectError(err)) {
          unstable_rethrow(err);
        }
      }
    });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      disabled={pending}
      className={`w-full text-left text-sm ${
        tone === "danger"
          ? "flex min-h-11 items-center justify-start! gap-3 rounded-xl! px-3! font-bold! text-bad-fg! hover:bg-bad-soft!"
          : "rounded-md px-3 py-2 text-slate-700 hover:bg-slate-50"
      } ${className}`}
      onClick={handleSignOut}
    >
      {icon}
      <span>{pending ? "Signing out…" : "Sign out"}</span>
    </Button>
  );
}
