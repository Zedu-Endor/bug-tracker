"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { googleSignInAction, loginAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { GoogleIcon } from "@/components/google-icon";

export function LoginForm({
  callbackUrl = "/dashboard",
  googleEnabled = false,
}: {
  callbackUrl?: string;
  googleEnabled?: boolean;
}) {
  // Only show Google button if OAuth is actually configured
  const showGoogleButton = googleEnabled;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Set once the password was right and the account has two-factor on (#648).
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // True when the error is about the credentials, so both fields are marked
  // invalid and described by the one message (#309). It never says which of
  // the two was wrong: that would reveal whether the account exists.
  const [credentialsInvalid, setCredentialsInvalid] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (credentialsInvalid) document.getElementById("email")?.focus();
  }, [credentialsInvalid]);
  useEffect(() => {
    if (needsCode) document.getElementById("totp")?.focus();
  }, [needsCode]);

  const fieldAttrs = credentialsInvalid
    ? ({ "aria-invalid": true, "aria-describedby": "login-error" } as const)
    : {};

  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setCredentialsInvalid(false);
        const formData = new FormData();
        formData.set("email", email);
        formData.set("password", password);
        if (needsCode) formData.set("totp", code);
        formData.set("callbackUrl", callbackUrl);
        startTransition(async () => {
          try {
            const result = await loginAction(undefined, formData);
            if (result?.error) {
              setError(result.error);
              setCredentialsInvalid(Boolean(result.field));
              if (result.needsCode) {
                setNeedsCode(true);
                setCode("");
              } else {
                setNeedsCode(false);
              }
            }
            // Success uses server redirect() only — no client router.push
            // (avoids navigation storms with middleware redirects).
          } catch (error) {
            // Must rethrow NEXT_REDIRECT so the framework can navigate.
            unstable_rethrow(error);
            setError("Something went wrong. Please try again.");
          }
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[13px] font-bold text-ink">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-11 rounded-xl px-3.5"
          {...fieldAttrs}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="password" className="text-[13px] font-bold text-ink">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 px-3.5"
          {...fieldAttrs}
        />
      </div>
      {needsCode ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="totp" className="text-[13px] font-bold text-ink">
            Authentication code
          </label>
          <Input
            id="totp"
            name="totp"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="123456"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-describedby="totp-help"
            className="h-11 rounded-xl px-3.5"
          />
          <p id="totp-help" className="text-xs leading-relaxed text-muted">
            Open your authenticator app and enter the 6-digit code. Lost your phone? Use one of
            your backup codes instead.
          </p>
        </div>
      ) : null}
      {error ? (
        <p
          id="login-error"
          className="rounded-xl border border-bad-bd bg-bad-soft px-3.5 py-2.5 text-sm text-bad-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button
        type="submit"
        className="h-11 w-full rounded-full text-sm font-bold"
        disabled={pending}
        style={{ backgroundColor: "var(--color-electric-blue-strong)" }}
      >
        {pending ? "Signing in…" : needsCode ? "Verify and sign in" : "Sign in"}
      </Button>
      {showGoogleButton ? (
        <>
          <div className="flex items-center gap-3 py-1 text-xs font-bold uppercase tracking-[0.06em] text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="h-12 w-full gap-3 rounded-full text-base font-bold"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  // Keep the requested page, e.g. an issue from its 404 (#457).
                  await googleSignInAction(callbackUrl);
                } catch (error) {
                  unstable_rethrow(error);
                  setError("Google sign-in failed. Please try again.");
                }
              });
            }}
          >
            <GoogleIcon />
            Continue with Google
          </Button>
        </>
      ) : null}
    </form>
  );
}
