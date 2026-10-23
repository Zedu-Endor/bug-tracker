"use client";

import { useState, useTransition } from "react";
import { LocalTime } from "@/components/local-time";
import {
  MAX_COMMENT_DEPTH,
  truncateCommentBody,
  type CommentNode,
} from "@/lib/comments";
import { canDeleteComment, canEditComment } from "@/lib/comment-permissions";
import type { AppRole } from "@/lib/roles";
import type { OrganizationRole } from "@/lib/organization-role";
import type { CommentType } from "@/lib/validations/issue";
import { deleteCommentAction, updateCommentAction } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { CommentBody, MentionText } from "@/components/comment-body";
import { CommentForm } from "@/components/comment-form";
import { MarkdownEditor } from "@/components/markdown-editor";
import { UserNameWithBadges } from "@/components/user-name-with-badges";
import { CopyLinkButton } from "@/components/copy-link-button";
import { AttachmentList, type AttachmentView } from "@/components/attachment-list";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type AttachmentsByComment = Record<string, AttachmentView[]>;
/** Each author's role in the issue's organization, by user id (#489). */
type OrganizationRoles = Record<string, OrganizationRole>;

type UserOption = { id: string; name: string };

function CommentTypeBadge({ type, metadata }: { type?: CommentType | null; metadata?: unknown }) {
  if (!type || type === "comment") return null;

  const meta = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : null;

  switch (type) {
    case "bid":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-warn-bd bg-warn-bg px-2 py-0.5 text-xs font-bold text-warn-fg">
          <span>🏷️</span>
          <span>Bid</span>
          {typeof meta?.eta === "string" ? <span className="opacity-80">· ETA: {meta.eta}</span> : null}
        </span>
      );
    case "review":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-info-fg/30 bg-info-bg px-2 py-0.5 text-xs font-bold text-info-fg">
          <span>🔍</span>
          <span>Review</span>
          {typeof meta?.verdict === "string" ? <span className="opacity-80">· {meta.verdict}</span> : null}
        </span>
      );
    case "delivery":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-ok-fg/30 bg-ok-bg px-2 py-0.5 text-xs font-bold text-ok-fg">
          <span>📦</span>
          <span>Delivery</span>
          {typeof meta?.prUrl === "string" ? (
            <a href={meta.prUrl} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
              PR
            </a>
          ) : null}
        </span>
      );
    case "request_to_merge":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-sec-fg/30 bg-sec-bg px-2 py-0.5 text-xs font-bold text-sec-fg">
          <span>🔀</span>
          <span>Request to Merge</span>
        </span>
      );
    default:
      return null;
  }
}

function CommentConfidence({ metadata }: { metadata?: unknown }) {
  if (!metadata || typeof metadata !== "object") return null;
  const { confidence, confidenceReason } = metadata as Record<string, unknown>;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) return null;
  return (
    <div className="mt-2 rounded-[10px] bg-chip px-3 py-2 text-xs text-ink-2 break-words">
      <span className="font-bold text-ink">Self-reported confidence: {confidence}%</span>
      {typeof confidenceReason === "string" && confidenceReason.trim() ? ` — ${confidenceReason}` : null}
    </div>
  );
}

function commentCardStyle(type?: CommentType | null): string {
  switch (type) {
    case "bid":
      return "border-l-warn-fg";
    case "review":
      return "border-l-info-fg";
    case "delivery":
      return "border-l-ok-fg";
    case "request_to_merge":
      return "border-l-sec-fg";
    default:
      return "border-l-line";
  }
}

/** The conversation filter's active pill takes the colour of the type it shows. */
const filterTone: Record<string, string> = {
  all: "bg-primary text-white",
  comment: "bg-chip-2 text-ink",
  bid: "border border-warn-bd bg-warn-bg text-warn-fg",
  review: "border border-info-fg/30 bg-info-bg text-info-fg",
  delivery: "border border-ok-fg/30 bg-ok-bg text-ok-fg",
  request_to_merge: "border border-sec-fg/30 bg-sec-bg text-sec-fg",
};

type ViewerProps = {
  currentUserId?: string;
  currentUserRole?: AppRole | null;
  /** Owner, admin, or site super admin of this issue's organization. */
  tenantAdmin?: boolean;
  /** Deleted issues: show comments but no reply, edit, delete or new comment. */
  readOnly?: boolean;
};

function CommentEditForm({
  comment,
  users,
  onDone,
}: {
  comment: CommentNode;
  users: UserOption[];
  onDone: () => void;
}) {
  const [body, setBody] = useState(comment.body);
  const [editorUploading, setEditorUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unchanged = body.trim() === comment.body.trim();

  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(event) => {
        if (pending || editorUploading) {
          event.preventDefault();
        }
      }}
      action={(formData) => {
        if (pending || editorUploading) return;
        setError(null);
        startTransition(async () => {
          const result = await updateCommentAction(comment.id, formData);
          if (result.error) setError(result.error);
          else onDone();
        });
      }}
    >
      <MarkdownEditor
        id={`edit-${comment.id}`}
        name="body"
        required
        rows={3}
        maxLength={2000}
        value={body}
        onChange={setBody}
        onUploadingChange={setEditorUploading}
        users={users}
        renderMentions={(text) => <MentionText text={text} users={users} />}
        aria-label="Edit comment"
      />
      {error ? (
        <p className="text-sm text-bad-fg" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending || !body.trim() || unchanged || editorUploading}>
          {pending ? "Saving…" : editorUploading ? "Uploading…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  bugId,
  issueUrl,
  reporterId,
  users,
  currentUserId,
  currentUserRole,
  tenantAdmin = false,
  attachmentsByComment = {},
  organizationRoles = {},
  readOnly = false,
}: {
  comment: CommentNode;
  bugId: string;
  /** Canonical issue URL, for each comment's permalink (#279). */
  issueUrl: string;
  reporterId: string;
  users: UserOption[];
  attachmentsByComment?: AttachmentsByComment;
  organizationRoles?: OrganizationRoles;
} & ViewerProps) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const confirm = useConfirm();
  const toast = useToast();
  const isDeleted = Boolean(comment.deletedAt);
  const canReply =
    !readOnly && comment.depth < MAX_COMMENT_DEPTH && !isDeleted;
  const canEdit = !readOnly && canEditComment(currentUserId, comment);
  const canDelete =
    !readOnly && canDeleteComment(currentUserId, currentUserRole, comment, tenantAdmin);

  const handleDelete = async () => {
    const own = comment.authorId === currentUserId;
    const confirmed = await confirm({
      title: own ? "Delete your comment?" : `Delete ${comment.author.name}'s comment?`,
      body: own
        ? "Replies will stay, and the comment will show as deleted."
        : "This is recorded in the activity log.",
      confirmLabel: "Delete comment",
      tone: "danger",
    });
    if (!confirmed) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCommentAction(comment.id);
      if (result.error) {
        setError(result.error);
        toast(result.error, "error");
      } else {
        toast("Comment deleted.");
      }
    });
  };

  return (
    <li
      id={`comment-${comment.id}`}
      // :target is the comment a permalink points at (#279); the highlight
      // needs no script, so it works on first load and on hash changes.
      // break-inside keeps a comment whole across printed pages (#300).
      className="group/comment scroll-mt-24 space-y-3 break-inside-avoid"
    >
      <article
        className={`rounded-2xl border border-line border-l-4 bg-surface px-4 py-4 group-target/comment:bg-tint group-target/comment:ring-2 group-target/comment:ring-primary/40 motion-safe:transition-colors ${commentCardStyle(comment.type)} ${
          comment.depth > 0 ? "border-l-primary" : ""
        }`}
      >
        {isDeleted ? (
          <p className="text-sm italic text-muted">This comment was deleted.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted">
              <div className="flex flex-wrap items-center gap-2">
                <UserNameWithBadges
                  name={comment.author.name}
                  role={comment.author.role}
                  organizationRole={organizationRoles[comment.authorId]}
                  image={comment.author.image}
                  avatar="sm"
                  userId={comment.authorId}
                  showAuthor={comment.authorId === reporterId}
                  agentName={comment.agent?.name}
                  className="font-bold text-ink"
                />
                <CommentTypeBadge type={comment.type} metadata={comment.metadata} />
              </div>
              <span className="inline-flex items-center gap-1.5">
                <a
                  href={`#comment-${comment.id}`}
                  className="hover:text-ink hover:underline"
                >
                  <LocalTime date={comment.createdAt} />
                </a>
                <CopyLinkButton
                  url={`${issueUrl}#comment-${comment.id}`}
                  label="comment"
                  compact
                />
                {comment.editedAt ? (
                  <span title="This comment was edited">· edited</span>
                ) : null}
              </span>
            </div>

            {comment.agentId || comment.agent ? <CommentConfidence metadata={comment.metadata} /> : null}

            {comment.parent ? (
              <p className="mt-2 rounded-md bg-chip px-2.5 py-1.5 text-xs text-muted break-words">
                Replying to{" "}
                <span className="font-bold text-ink">
                  {comment.parent.author.name}
                </span>
                {": "}
                <span className="italic text-ink-2">
                  {comment.parent.deletedAt
                    ? "deleted comment"
                    : truncateCommentBody(comment.parent.body)}
                </span>
              </p>
            ) : null}

            {editing ? (
              <CommentEditForm
                comment={comment}
                users={users}
                onDone={() => setEditing(false)}
              />
            ) : (
              <>
                <CommentBody body={comment.body} users={users} />
                <AttachmentList attachments={attachmentsByComment[comment.id] ?? []} />
              </>
            )}
          </>
        )}

        {!editing && (canReply || canEdit || canDelete) ? (
          <div className="mt-2">
            {replying ? (
              <CommentForm
                bugId={bugId}
                users={users}
                viewerId={currentUserId}
                parentId={comment.id}
                parentAuthorName={comment.author.name}
                onCancel={() => setReplying(false)}
                onSuccess={() => setReplying(false)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-1">
                {canReply ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs text-accent hover:opacity-80"
                    onClick={() => setReplying(true)}
                  >
                    Reply
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs text-ink-2 hover:text-ink"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    className="px-2 py-1 text-xs text-ink-2 hover:text-bad-fg"
                    onClick={handleDelete}
                  >
                    {pending ? "Deleting…" : "Delete"}
                  </Button>
                ) : null}
              </div>
            )}
            {error ? (
              <p className="mt-1 text-xs text-bad-fg" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </article>

      {comment.children.length > 0 ? (
        <ul className="ml-2.5 space-y-3 border-l border-line pl-2.5 sm:ml-6 sm:pl-4">
          {comment.children.map((child) => (
            <CommentItem
              key={child.id}
              comment={child}
              bugId={bugId}
              issueUrl={issueUrl}
              reporterId={reporterId}
              users={users}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              tenantAdmin={tenantAdmin}
              attachmentsByComment={attachmentsByComment}
              organizationRoles={organizationRoles}
              readOnly={readOnly}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CommentThread({
  bugId,
  issueUrl,
  reporterId,
  comments,
  users,
  currentUserId,
  currentUserRole,
  tenantAdmin = false,
  attachmentsByComment = {},
  organizationRoles = {},
  readOnly = false,
}: {
  bugId: string;
  issueUrl: string;
  reporterId: string;
  comments: CommentNode[];
  users: UserOption[];
  /** Files attached to each comment, by comment id (#215). */
  attachmentsByComment?: AttachmentsByComment;
  organizationRoles?: OrganizationRoles;
} & ViewerProps) {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const filteredComments = comments.filter((comment) => {
    if (typeFilter === "all") return true;
    const cType = comment.type || "comment";
    return cType === typeFilter;
  });

  return (
    <div className="mt-4 space-y-6">
      {comments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: "all", label: "All" },
            { id: "comment", label: "Comments" },
            { id: "bid", label: "Bids" },
            { id: "review", label: "Reviews" },
            { id: "delivery", label: "Deliveries" },
            { id: "request_to_merge", label: "Merge Requests" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTypeFilter(tab.id)}
              aria-pressed={typeFilter === tab.id}
              className={`inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-bold transition-colors ${
                typeFilter === tab.id
                  ? filterTone[tab.id] ?? filterTone.all
                  : "border border-line bg-surface text-ink-2 hover:bg-tint"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}

      {comments.length === 0 && !readOnly ? (
        <div role="status" className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
          <p className="text-sm font-bold text-ink">No comments yet.</p>
          <p className="mt-1 text-sm text-muted">
            Agents and reviewers haven’t posted any updates here yet.
          </p>
          <p className="mt-2 text-sm text-ink-2">
            Start the conversation below with a question, helpful context, or a proposed solution.
          </p>
        </div>
      ) : filteredComments.length === 0 ? (
        <p className="text-sm text-muted">
          {comments.length > 0
            ? "No timeline entries match this filter."
            : "No conversation."}
        </p>
      ) : (
        <ul className="space-y-4">
          {filteredComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              bugId={bugId}
              issueUrl={issueUrl}
              reporterId={reporterId}
              users={users}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              tenantAdmin={tenantAdmin}
              attachmentsByComment={attachmentsByComment}
              organizationRoles={organizationRoles}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <CommentForm bugId={bugId} users={users} viewerId={currentUserId} />
      )}
    </div>
  );
}
