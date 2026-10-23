"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { errorIdFor, fieldErrorAttrs, type FieldErrorResult } from "@/lib/form-errors";

/**
 * Per-field validation state for a form (#309).
 *
 * `show(result)` takes whatever the server action returned. When it names a
 * field, that control is marked invalid, described by its own message, and
 * focused — so a screen-reader user lands on the thing to fix and hears why.
 * When it names none (a network failure, a rate limit), the message stays a
 * form-level alert as before.
 */
export function useFieldErrors(formId: string, formRef: RefObject<HTMLFormElement | null>) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [focusField, setFocusField] = useState<string | null>(null);

  const show = useCallback((result: Partial<FieldErrorResult>) => {
    const errors =
      result.fieldErrors ??
      (result.field && result.error ? { [result.field]: result.error } : {});
    setFieldErrors(errors);
    setFocusField(result.field ?? Object.keys(errors)[0] ?? null);
  }, []);

  const clear = useCallback(() => {
    setFieldErrors({});
    setFocusField(null);
  }, []);

  // Focus after the render that marked the field invalid, so the control is
  // already announced as invalid and described by its message when it lands.
  useEffect(() => {
    if (!focusField) return;
    const form = formRef.current;
    const target =
      form?.querySelector<HTMLElement>(`#${CSS.escape(focusField)}`) ??
      (form?.elements.namedItem(focusField) as HTMLElement | null);
    target?.focus();
  }, [focusField, formRef]);

  const attrs = useCallback(
    (field: string) => fieldErrorAttrs(formId, field, fieldErrors),
    [formId, fieldErrors],
  );

  return { fieldErrors, show, clear, attrs, formId };
}

/** The message under one control. Renders nothing when that field is fine. */
export function FieldError({
  formId,
  field,
  errors,
}: {
  formId: string;
  field: string;
  errors: Record<string, string>;
}) {
  const message = errors[field];
  if (!message) return null;
  return (
    <p id={errorIdFor(formId, field)} className="text-sm text-bad-fg">
      {message}
    </p>
  );
}

/**
 * A list of every failing field at the top of a longer form, each linking to
 * its control. Only shown when more than one field failed: with one, focus
 * is already on it and the message is right beside it.
 */
export function ErrorSummary({
  errors,
  labels,
}: {
  errors: Record<string, string>;
  labels: Record<string, string>;
}) {
  const entries = Object.entries(errors);
  if (entries.length < 2) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <p className="font-medium">
        {entries.length} fields need attention:
      </p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {entries.map(([field, message]) => (
          <li key={field}>
            <a
              href={`#${field}`}
              className="underline hover:text-red-900"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(field)?.focus();
              }}
            >
              {labels[field] ?? field}
            </a>
            : {message}
          </li>
        ))}
      </ul>
    </div>
  );
}
