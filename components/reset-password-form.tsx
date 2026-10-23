"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { resetPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldError, useFieldErrors } from "@/components/ui/field-errors";
import { PasswordInput } from "@/components/ui/password-input";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const errs = useFieldErrors("reset", formRef);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        errs.clear();

        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }

        if (password !== confirmPassword) {
          setError("Passwords do not match");
          return;
        }

        const formData = new FormData();
        formData.set("token", token);
        formData.set("password", password);
        formData.set("confirmPassword", confirmPassword);
        startTransition(async () => {
          try {
            const result = await resetPasswordAction(undefined, formData);
            if (result?.error) {
              if (result.field) errs.show(result);
              else setError(result.error);
            }
          } catch (error) {
            unstable_rethrow(error);
            setError("Something went wrong. Please try again.");
          }
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[13px] font-bold text-ink">
          New password
        </label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-describedby="password-hint"
          aria-invalid={password.length > 0 && password.length < 8 ? true : undefined}
          placeholder="At least 8 characters"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (error) setError(null);
          }}
          className="h-12 px-3.5"
          {...errs.attrs("password")}
        />
        <p id="password-hint" className="text-xs text-warn-fg" aria-live="polite">
          {password.length > 0 && password.length < 8 && !error
            ? "Must be at least 8 characters"
            : ""}
        </p>
        <FieldError formId={errs.formId} field="password" errors={errs.fieldErrors} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="confirmPassword" className="text-[13px] font-bold text-ink">
          Confirm new password
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          visibilityLabel="confirm password"
          autoComplete="new-password"
          required
          minLength={8}
          aria-describedby="confirm-password-hint"
          aria-invalid={
            confirmPassword.length > 0 && password !== confirmPassword ? true : undefined
          }
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            if (error) setError(null);
          }}
          className="h-12 px-3.5"
          {...errs.attrs("confirmPassword")}
        />
        <p
          id="confirm-password-hint"
          className={`text-xs ${
            confirmPassword.length > 0 && password === confirmPassword
              ? "text-ok-fg"
              : "text-bad-fg"
          }`}
          aria-live="polite"
        >
          {confirmPassword.length > 0 && !error
            ? confirmPassword.length > 0 && password === confirmPassword
              ? "Passwords match"
              : confirmPassword.length > 0 && password !== confirmPassword
                ? "Passwords do not match"
                : ""
            : ""}
        </p>
        <FieldError formId={errs.formId} field="confirmPassword" errors={errs.fieldErrors} />
      </div>
      {error ? (
        <p
          className="rounded-xl border border-bad-bd bg-bad-soft p-3 text-sm text-bad-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" className="h-12 w-full rounded-full font-bold" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
