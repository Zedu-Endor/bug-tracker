"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { addCommentAction } from "@/app/actions/issues";
import { Button } from "@/components/ui/button";
import {
  MarkdownEditor,
  type MarkdownEditorHandle,
} from "@/components/markdown-editor";
import { MentionText } from "@/components/comment-body";
import { AttachmentPicker } from "@/components/attachment-picker";
import { clearDraft, discardLegacyDraft, draftKey, readDraft, writeDraft } from "@/lib/comment-draft";
import { useToast } from "@/components/ui/toast";
import type { CommentType } from "@/lib/validations/issue";

type UserOption = { id: string; name: string };

type CommentFormProps = {
  bugId: string;
  users: UserOption[];
  /** The signed-in viewer, so drafts never cross accounts (#481). */
  viewerId?: string | null;
  parentId?: string;
  parentAuthorName?: string;
  onCancel?: () => void;
  onSuccess?: () => void;
};

export function CommentForm({
  bugId,
  users,
  viewerId,
  parentId,
  parentAuthorName,
  onCancel,
  onSuccess,
}: CommentFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [body, setBody] = useState("");
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remounts the file picker after a successful post, clearing it (#215).
  const [pickerKey, setPickerKey] = useState(0);
  const toast = useToast();
  const [commentType, setCommentType] = useState<CommentType>("comment");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSettling, setIsSettling] = useState(false);
  const [pending, startTransition] = useTransition();
  const isReply = Boolean(parentId);
  const key = draftKey(viewerId, bugId, parentId);
  const bodyId = parentId ? `body-${parentId}` : "body";
  const errorId = `${bodyId}-error`;
  const [bodyInvalid, setBodyInvalid] = useState(false);
  const [editorUploading, setEditorUploading] = useState(false);
  const [pickerUploading, setPickerUploading] = useState(false);
  const isUploading = editorUploading || pickerUploading;

  // localStorage only exists on the client, so this cannot be a state
  // initializer without the server and client rendering different markup,
  // and setting state during the effect would be the cascading render the
  // lint rule warns about. A microtask after mount is the first safe moment.
  useEffect(() => {
    // Drafts saved before #481 have no viewer in the key. They cannot be
    // attributed, so drop them here instead of handing them to whoever is
    // signed in now.
    discardLegacyDraft(localStorage, bugId, parentId);
    const saved = readDraft(localStorage, key);
    if (!saved) return;
    queueMicrotask(() => {
      // Don't stamp over anything typed in the moment before this ran.
      setBody((current) => (current ? current : saved));
      setRestored(true);
    });
  }, [bugId, key, parentId]);

  const update = useCallback(
    (next: string) => {
      setBody(next);
      setRestored(false);
      setStatusMessage("");
      writeDraft(localStorage, key, next);
    },
    [key],
  );

  return (
    <form
      ref={formRef}
      className="space-y-3"
      onSubmit={(event) => {
        if (pending || isSettling || isUploading) {
          event.preventDefault();
        }
      }}
      action={(formData) => {
        if (pending || isSettling || isUploading) return;
        setError(null);
        setBodyInvalid(false);
        setStatusMessage("");
        setIsSettling(true);
        startTransition(async () => {
          try {
            const result = await addCommentAction(bugId, formData);
            if (result.error) {
              setError(result.error);
              // The only field is the body, so a field error is about it (#309).
              if (result.field) {
                setBodyInvalid(true);
                document.getElementById(bodyId)?.focus();
              }
            } else {
              setBody("");
              setRestored(false);
              clearDraft(localStorage, key);
              formRef.current?.reset();
              setPickerKey((k) => k + 1);
              const message = isReply ? "Reply posted." : "Comment posted.";
              setStatusMessage(message);
              toast(message);

              if (result.commentId && typeof window !== "undefined") {
                const targetId = `comment-${result.commentId}`;
                window.history.replaceState(null, "", `#${targetId}`);
                const scrollToComment = (attempts = 0) => {
                  const el = document.getElementById(targetId);
                  if (el) {
                    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    const article = el.querySelector("article");
                    if (article) {
                      article.classList.add("ring-2", "ring-primary", "ring-offset-2");
                      setTimeout(() => {
                        article.classList.remove("ring-2", "ring-primary", "ring-offset-2");
                      }, 2000);
                    }
                    const focusTarget =
                      el.querySelector<HTMLElement>("a[href^='#comment-']") ?? el;
                    if (!focusTarget.hasAttribute("tabindex") && focusTarget === el) {
                      focusTarget.setAttribute("tabindex", "-1");
                    }
                    focusTarget.focus();
                  } else if (attempts < 5) {
                    setTimeout(() => scrollToComment(attempts + 1), 100);
                  }
                };
                requestAnimationFrame(() => scrollToComment(0));
              }

              onSuccess?.();
            }
          } finally {
            setIsSettling(false);
          }
        });
      }}
    >
      {parentId ? (
        <input type="hidden" name="parentId" value={parentId} />
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label
          id={`${parentId ? `body-${parentId}` : "body"}-label`}
          htmlFor={parentId ? `body-${parentId}` : "body"}
          className="block text-[15px] font-bold text-ink"
        >
          {isReply
            ? `Reply to ${parentAuthorName ?? "comment"}`
            : "Add to conversation"}
        </label>
        {parentId ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="comment-type-select" className="text-[13px] font-semibold text-muted">
              Type
            </label>
            <select
              id="comment-type-select"
              name="type"
              value={commentType}
              onChange={(e) => setCommentType(e.target.value as CommentType)}
              className="h-[38px] rounded-full border border-line bg-surface px-3 text-[13px] font-bold text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="comment">💬 Comment</option>
              <option value="bid">🏷️ Bid</option>
              <option value="review">🔍 Review</option>
              <option value="delivery">📦 Delivery</option>
              <option value="request_to_merge">🔀 Request to Merge</option>
            </select>
          </div>
        )}
      </div>
      <MarkdownEditor
        ref={editorRef}
        id={parentId ? `body-${parentId}` : "body"}
        labelId={`${parentId ? `body-${parentId}` : "body"}-label`}
        name="body"
        required
        rows={isReply ? 3 : 4}
        maxLength={2000}
        disabled={pending}
        value={body}
        onChange={update}
        {...(bodyInvalid ? { "aria-invalid": true, "aria-describedby": errorId } : {})}
        users={users}
        renderMentions={(text) => <MentionText text={text} users={users} />}
        onUploadingChange={setEditorUploading}
        placeholder={
          isReply
            ? "Write your reply… Type @ to mention someone (they get notified)"
            : "Add to the conversation… Type @ to mention someone (they get notified)"
        }
        footer={
          <p className="text-xs text-muted">
            Markdown is supported. People you @mention get an email and an
            in-app notification (they can turn these off in Settings).
          </p>
        }
      />
      <AttachmentPicker
        key={pickerKey}
        disabled={pending}
        onUploadingChange={setPickerUploading}
      />
      {error ? (
        <p id={errorId} className="text-sm text-bad-fg" role="alert">
          {error}
        </p>
      ) : null}
      {restored ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-ink-2" role="status">
          <span>Restored an unsent draft.</span>
          <button
            type="button"
            className="rounded-sm font-bold text-accent underline hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => update("")}
          >
            Discard it
          </button>
        </p>
      ) : null}
      {statusMessage ? (
        <p role="status" aria-live="polite" className="text-xs text-ok-fg font-medium">
          {statusMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || isSettling || !body.trim() || isUploading}>
          {pending || isSettling
            ? isReply
              ? "Replying…"
              : "Posting…"
            : isUploading
              ? "Uploading…"
              : isReply
                ? "Post reply"
                : "Post to conversation"}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending || isSettling}
            onClick={onCancel}
            // The draft stays saved: cancelling a reply is usually "not now",
            // and re-opening it restores what was typed.
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}