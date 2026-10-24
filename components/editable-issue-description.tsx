"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { editBugContentAction } from "@/app/actions/issues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/markdown-editor";
import { RichText } from "@/components/rich-text";
import { MentionText } from "@/components/comment-body";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { ExpandableText } from "@/components/expandable-text";

export type EditableIssueDescriptionProps = {
  bugId: string;
  initialTitle: string;
  initialDescription: string;
  canEdit: boolean;
  users: { id: string; name: string }[];
  children?: ReactNode;
  expandedByDefault?: boolean;
  /** When the title or description was last edited (#303); null if never. */
  lastEditedAt?: Date | null;
  historyHref?: string;
  /** When the issue was created (#422); shown on the heading row. */
  createdAt?: Date | string | null;
};

export function EditableIssueDescription({
  bugId,
  initialTitle,
  initialDescription,
  canEdit,
  users,
  children,
  lastEditedAt = null,
  historyHref,
  createdAt = null,
  expandedByDefault = false,
}: EditableIssueDescriptionProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [editorUploading, setEditorUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleStartEdit = () => {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setError(null);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setTitle(initialTitle);
    setDescription(initialDescription);
    setError(null);
    setIsEditing(false);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending || editorUploading) return;
    setError(null);

    const formData = new FormData();
    formData.set("title", title);
    formData.set("description", description);

    startTransition(async () => {
      const result = await editBugContentAction(bugId, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setIsEditing(false);
        router.refresh();
      }
    });
  };

  const mentionUsers = users.map((u) => ({ id: u.id, name: u.name }));

  return (
    <section className="flex flex-col gap-3.5 rounded-[20px] border border-zk-border bg-zk-surface p-5 sm:p-6" aria-label="Description">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-zk-divider pb-3">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-xs font-semibold text-zk-muted">
            {isEditing ? "Edit issue" : "Description"}
          </h2>
          {!isEditing && lastEditedAt && historyHref ? (
            <p className="text-xs text-zk-muted">
              edited <LocalTime date={lastEditedAt} /> ·{" "}
              <Link href={historyHref} className="font-bold text-zk-accent hover:underline">
                view history
              </Link>
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {!isEditing && createdAt ? (
            <p className="text-xs text-zk-muted">
              <span className="sr-only">Created </span>
              <LocalTime date={createdAt} />
            </p>
          ) : null}
          {canEdit && !isEditing ? (
            <Button
              variant="ghost"
              className="min-h-8 px-2.5 py-1 text-xs font-bold text-zk-accent hover:text-zk-accent"
              onClick={handleStartEdit}
            >
              Edit
            </Button>
          ) : null}
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {error ? (
            <div
              className="rounded-xl border border-zk-bad-bd bg-zk-bad-bg p-3 text-sm text-zk-bad-fg"
              role="alert"
            >
              {error}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="edit-issue-title"
              className="text-xs font-medium text-zk-text2"
            >
              Title
            </label>
            <Input
              id="edit-issue-title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={200}
              placeholder="Short summary of the issue"
              disabled={pending}
            />
          </div>

          <div className="space-y-1.5">
            <label
              id="edit-issue-description-label"
              htmlFor="edit-issue-description"
              className="text-xs font-medium text-zk-text2"
            >
              Description
            </label>
            <MarkdownEditor
              id="edit-issue-description"
              labelId="edit-issue-description-label"
              name="description"
              value={description}
              onChange={setDescription}
              onUploadingChange={setEditorUploading}
              users={mentionUsers}
              minLength={10}
              maxLength={5000}
              rows={6}
              disabled={pending}
              placeholder="Steps to reproduce, expected vs actual, environment…"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              disabled={
                pending ||
                editorUploading ||
                title.trim().length < 3 ||
                description.trim().length < 10
              }
            >
              {pending ? "Saving…" : editorUploading ? "Uploading…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={handleCancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="max-w-3xl text-[15px] leading-[1.7] text-zk-text">
          <ExpandableText maxLines={6} expandText="View more" collapseText="View less" initiallyExpanded={expandedByDefault}>
            <RichText
              content={initialDescription}
              renderMentions={(text) => <MentionText text={text} users={users} />}
            />
          </ExpandableText>
        </div>
      )}

      {children}
    </section>
  );
}
