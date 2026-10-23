"use client";

import { useRef, useState, useTransition } from "react";
import { forgotPasswordAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { FieldError, useFieldErrors } from "@/components/ui/field-errors";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const errs = useFieldErrors("forgot", formRef);

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        errs.clear();
        setSuccess(null);
        const formData = new FormData();
        formData.set("email", email);
        startTransition(async () => {
          const result = await forgotPasswordAction(undefined, formData);
          if (result?.error) {
            if (result.field) errs.show(result);
            else setError(result.error);
            return;
          }
          if (result?.success) {
            setSuccess(result.success);
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
          required
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12 rounded-xl px-3.5"
          {...errs.attrs("email")}
        />
        <FieldError formId={errs.formId} field="email" errors={errs.fieldErrors} />
      </div>
      {error ? (
        <p
          className="rounded-xl border border-bad-bd bg-bad-soft p-3 text-sm text-bad-fg"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          className="rounded-xl border border-ok-fg/25 bg-ok-bg p-3 text-sm text-ok-fg"
          role="status"
        >
          {success}
        </p>
      ) : null}
      <Button type="submit" className="h-12 w-full rounded-full font-bold" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
