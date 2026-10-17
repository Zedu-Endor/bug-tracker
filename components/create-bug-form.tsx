"use client";

import { useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { createBugAction, type ActionResult } from "@/app/actions/bugs";
import { submitFailureMessage } from "@/lib/submit-error";
import { severities } from "@/lib/validations/bug";
import { severityLabels } from "@/lib/labels";
import type { AppRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CharacterCounter } from "@/components/ui/character-counter";
import { AttachmentPicker } from "@/components/attachment-picker";
import { MarkdownEditor } from "@/components/markdown-editor";
import { useFormDraft } from "@/components/use-form-draft";
import { buildDraftKey } from "@/lib/form-drafts";
import { DraftBanner } from "@/components/draft-banner";
import { AssigneeCombobox } from "@/components/assignee-combobox";

/** Must match the title limit enforced by createBugSchema. */
const TITLE_MAX_LENGTH = 200;

type UserOption = { id: string; name: string; role: AppRole };
type CategoryOption = { id: string; name: string };
type TypeOption = { id: string; name: string; description?: string | null };

export function CreateBugForm({
  users,
  categories = [],
  types = [],
  isAdmin,
  currentUserId,
}: {
  users: UserOption[];
  categories?: CategoryOption[];
  types?: TypeOption[];
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const defaultTypeId =
    types.find((t) => t.name.toLowerCase() === "fix")?.id ?? types[0]?.id ?? "";
  const draftKey = buildDraftKey({
    userId: currentUserId,
    formType: "create-bug",
  });

  const { values, setValue, isRestored, clearDraft, discardDraft } = useFormDraft(
    draftKey,
    {
      title: "",
      typeId: defaultTypeId,
      description: "",
      categoryId: "",
      proofLinks: "",
      severity: "medium" as (typeof severities)[number],
      assigneeId: "",
      assignToMe: false,
    },
  );
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // True when the request itself failed (network / server error), so the
  // person can simply retry; validation errors from the server aren't retryable.
  const [canRetry, setCanRetry] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const mentionUsers = users.map((user) => ({ id: user.id, name: user.name }));

  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setCanRetry(false);
        const formData = new FormData();
        formData.set("title", values.title);
        formData.set("typeId", values.typeId);
        formData.set("description", values.description);
        formData.set("categoryId", values.categoryId);
        formData.set("proofLinks", values.proofLinks);
        formData.set("attachmentIds", attachmentIds.join(","));
        if (isAdmin) {
          formData.set("severity", values.severity);
          formData.set("assigneeId", values.assigneeId);
        } else if (values.assignToMe && currentUserId) {
          formData.set("assigneeId", currentUserId);
        }
        startTransition(async () => {
          try {
            const result: ActionResult = await createBugAction(formData);
            if (result.error) {
              setError(result.error);
            } else {
              clearDraft();
            }
          } catch (error) {
            unstable_rethrow(error);
            setError(submitFailureMessage(navigator.onLine));
            setCanRetry(true);
          }
        });
      }}
    >
      {isRestored ? (
        <DraftBanner
          onDiscard={discardDraft}
          message="Restored unsaved draft from this browser"
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="title" className="text-sm font-medium text-slate-700">
            Title
          </label>
          <Input
            id="title"
            name="title"
            required
            minLength={3}
            maxLength={TITLE_MAX_LENGTH}
            placeholder="Short summary of the issue"
            value={values.title}
            onChange={(event) => setValue("title", event.target.value)}
          />
          <CharacterCounter
            length={values.title.length}
            max={TITLE_MAX_LENGTH}
            className="text-right"
          />
        </div>
        {types.length > 0 ? (
          <div className="space-y-1.5">
            <label htmlFor="typeId" className="text-sm font-medium text-slate-700">
              Type
            </label>
            <Select
              id="typeId"
              name="typeId"
              value={values.typeId}
              onChange={(event) => setValue("typeId", event.target.value)}
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="categoryId"
          className="text-sm font-medium text-slate-700"
        >
          Platform
        </label>
        <Select
          id="categoryId"
          name="categoryId"
          value={values.categoryId}
          onChange={(event) => setValue("categoryId", event.target.value)}
        >
          <option value="">Select a platform</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <label
          id="description-label"
          htmlFor="description"
          className="text-sm font-medium text-slate-700"
        >
          Description
        </label>
        <MarkdownEditor
          id="description"
          labelId="description-label"
          name="description"
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          placeholder="Steps to reproduce, expected vs actual, environment…"
          value={values.description}
          onChange={(val) => setValue("description", val)}
          users={mentionUsers}
          footer={
            <p className="text-xs text-slate-500">
              Markdown is supported. Be specific: what should happen, what
              actually happens, and how to reproduce it.
            </p>
          }
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="proofLinks"
          className="text-sm font-medium text-slate-700"
        >
          Proof links (GitHub)
        </label>
        <Textarea
          id="proofLinks"
          name="proofLinks"
          rows={3}
          placeholder={
            "https://github.com/organization/repo/issues/123\nhttps://github.com/organization/repo/pull/456"
          }
          value={values.proofLinks}
          onChange={(event) => setValue("proofLinks", event.target.value)}
        />
        <p className="text-xs text-slate-500">
          Optional. One GitHub link per line (e.g. https://github.com/org/repo/issues/123). You need to have created the issue on GitHub first or gotten it from GitHub before adding the link here.
        </p>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-slate-700">
          Screenshots and files
        </legend>
        <p className="text-xs text-slate-500">
          Optional. No GitHub account needed: attach a screenshot, console log
          or recording export straight to the report.
        </p>
        <AttachmentPicker name="attachmentIdsPicker" onChange={setAttachmentIds} />
      </fieldset>
      {isAdmin ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="severity"
              className="text-sm font-medium text-slate-700"
            >
              Severity
            </label>
            <Select
              id="severity"
              name="severity"
              value={values.severity}
              onChange={(event) =>
                setValue("severity", event.target.value as (typeof severities)[number])
              }
            >
              {severities.map((value) => (
                <option key={value} value={value}>
                  {severityLabels[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="assigneeId"
              className="text-sm font-medium text-slate-700"
            >
              Assignee
            </label>
            <AssigneeCombobox
              id="assigneeId"
              name="assigneeId"
              people={users}
              value={values.assigneeId}
              onChange={(val) => setValue("assigneeId", val)}
            />
          </div>
        </div>
      ) : currentUserId ? (
        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="assignToMe"
            checked={values.assignToMe}
            onChange={(e) => setValue("assignToMe", e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          <label
            htmlFor="assignToMe"
            className="text-sm font-medium text-slate-700 cursor-pointer"
          >
            Assign this issue to myself
          </label>
        </div>
      ) : null}
      {error ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" role="alert">
          <p className="text-sm text-red-600">{error}</p>
          {canRetry ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => formRef.current?.requestSubmit()}
              className="text-sm font-medium text-teal-700 underline-offset-2 hover:underline disabled:opacity-50"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create issue"}
      </Button>
    </form>
  );
}
