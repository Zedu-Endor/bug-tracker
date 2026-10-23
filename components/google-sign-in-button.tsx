"use client";

import { useFormStatus } from "react-dom";
import { googleSignInAction } from "@/app/actions/auth";
import { GoogleIcon } from "@/components/google-icon";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="secondary"
      className="h-12 w-full gap-3 rounded-full border-line bg-surface text-base font-bold text-ink hover:bg-tint focus-visible:ring-primary disabled:opacity-60"
      disabled={pending}
    >
      <GoogleIcon />
      <span>{pending ? "Connecting to Google…" : "Continue with Google"}</span>
    </Button>
  );
}

export function GoogleSignInButton({
  callbackUrl = "/dashboard",
}: {
  callbackUrl?: string;
}) {
  return (
    <form action={googleSignInAction} className="space-y-3">
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <SubmitButton />
    </form>
  );
}
