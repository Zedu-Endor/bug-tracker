"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { updateDisplayNameAction, type DisplayNameResult } from "@/app/actions/settings";
import { FieldError, useFieldErrors } from "@/components/ui/field-errors";
import { useToast } from "@/components/ui/toast";
import { DISPLAY_NAME_MAX } from "@/lib/display-name";

const FORM_ID = "display-name";

/** Change how your name appears on issues and comments (#293). */
export function DisplayNameForm({
  initialName,
  avatarInitials,
}: {
  initialName: string;
  /** Optional initials shown beside the field (settings Account card). */
  avatarInitials?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const toast = useToast();
  const { fieldErrors, show, clear, attrs } = useFieldErrors(FORM_ID, formRef);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [justSaved, setJustSaved] = useState(false);
  const [result, action, pending] = useActionState<DisplayNameResult | undefined, FormData>(
    async (previous, formData) => {
      const next = await updateDisplayNameAction(previous, formData);
      if (next.ok && next.name) {
        setName(next.name);
        setSavedName(next.name);
        setJustSaved(true);
      } else {
        setJustSaved(false);
      }
      return next;
    },
    undefined,
  );

  const trimmed = name.trim();
  const dirty = trimmed !== "" && trimmed !== savedName.trim();
  const saveDisabled = pending || !dirty;

  useEffect(() => {
    if (!result) return;
    if (result.ok) {
      clear();
      toast("Display name updated.", "success");
    } else {
      show({ error: result.error ?? "Enter a valid name.", field: result.field, fieldErrors: result.fieldErrors });
      document.getElementById("name")?.focus();
    }
  }, [result, show, clear, toast]);

  const initials =
    avatarInitials ??
    (savedName.trim()
      ? savedName
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part[0]?.toUpperCase() ?? "")
          .join("")
      : "?");

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center gap-4">
        <span
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-electric-blue-strong text-[22px] font-extrabold text-white"
          aria-hidden="true"
        >
          {initials}
        </span>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-[13px] font-bold text-zk-text">
          Display name
          <span className="flex flex-wrap gap-2.5">
            <input
              id="name"
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setJustSaved(false);
              }}
              autoComplete="name"
              maxLength={DISPLAY_NAME_MAX + 20}
              required
              className="h-[46px] min-w-0 flex-1 rounded-xl border border-zk-border bg-zk-surface px-3.5 text-sm text-zk-text outline-none focus-visible:ring-2 focus-visible:ring-electric-blue sm:min-w-[220px]"
              {...attrs("name")}
            />
            <button
              type="submit"
              disabled={saveDisabled}
              className={`h-[46px] rounded-full px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue focus-visible:ring-offset-2 ${
                saveDisabled
                  ? "cursor-not-allowed bg-zk-chip text-zk-muted"
                  : "bg-electric-blue-strong text-white hover:brightness-105"
              }`}
            >
              {pending ? "Saving…" : "Save name"}
            </button>
          </span>
        </label>
      </div>
      <FieldError formId={FORM_ID} field="name" errors={fieldErrors} />
      <p className="text-xs leading-relaxed text-zk-muted">
        Shown beside your issues and comments, including ones you&apos;ve already
        posted. Your email stays the same.
      </p>
      {justSaved && !dirty ? (
        <span className="inline-flex self-start rounded-full bg-zk-ok-bg px-2.5 py-1 text-xs font-bold text-zk-ok-fg">
          Name saved
        </span>
      ) : null}
    </form>
  );
}
