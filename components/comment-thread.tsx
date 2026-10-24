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
type ViewerProps = {
  currentUserId?: string;
  currentUserRole?: AppRole | null;
  tenantAdmin?: boolean;
  readOnly?: boolean;
};

type UserOption = { id: string; name: string };

const commentTypeVisual: Record<
  CommentType,
  { label: string; chip: string; accent: string; filterOn: string }
> = {
  comment: {
    label: "Comment",
    chip: "bg-zk-chip text-zk-text2",
    accent: "border-l-zk-border",
    filterOn: "border-transparent bg-zk-chip text-zk-text2",
  },
  bid: {
    label: "Bid",
    chip: "bg-zk-warn-bg text-zk-warn-fg",
    accent: "border-l-zk-warn-fg",
    filterOn: "border-transparent bg-zk-warn-bg text-zk-warn-fg",
  },
  review: {
    label: "Review",
    chip: "bg-zk-info-bg text-zk-info-fg",
    accent: "border-l-zk-info-fg",
    filterOn: "border-transparent bg-zk-info-bg text-zk-info-fg",
  },
  delivery: {
    label: "Delivery",
    chip: "bg-zk-ok-bg text-zk-ok-fg",
    accent: "border-l-zk-ok-fg",
    filterOn: "border-transparent bg-zk-ok-bg text-zk-ok-fg",
  },
  request_to_merge: {
    label: "Merge request",
    chip: "bg-[var(--issue-sec-bg,#FDECEF)] text-[var(--issue-sec-fg,#B4233F)]",
    accent: "border-l-[var(--issue-sec-fg,#B4233F)]",
    filterOn: "border-transparent bg-[var(--issue-sec-bg,#FDECEF)] text-[var(--issue-sec-fg,#B4233F)]",
  },
};

function CommentTypeBadge({ type, metadata }: { type?: CommentType | null; metadata?: unknown }) {
  const resolved: CommentType = type && type in commentTypeVisual ? type : "comment";
  const visual = commentTypeVisual[resolved];
  const meta = typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${visual.chip}`}
    >
      <span>{visual.label}</span>
      {resolved === "bid" && typeof meta?.eta === "string" ? (
        <span>· ETA: {meta.eta}</span>
      ) : null}
      {resolved === "review" && typeof meta?.verdict === "string" ? (
        <span>· {meta.verdict}</span>
      ) : null}
      {resolved === "delivery" && typeof meta?.prUrl === "string" ? (
        <a
          href={meta.prUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:opacity-80"
        >
          PR
        </a>
      ) : null}
    </span>
  );
}

function CommentConfidence({ metadata }: { metadata?: unknown }) {
  if (!metadata || typeof metadata !== "object") return null;
  const { confidence, confidenceReason } = metadata as Record<string, unknown>;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 0 || confidence > 100) return null;
  return (
    <div className="mt-2 rounded-[10px] bg-zk-chip px-3 py-2 text-[13px] text-zk-text2 break-words">
      <strong className="font-semibold text-zk-text">Self-reported confidence: {confidence}%</strong>
      {typeof confidenceReason === "string" && confidenceReason.trim() ? ` — ${confidenceReason}` : null}
    </div>
  );
}

function commentCardStyle(type?: CommentType | null): string {
  const resolved: CommentType = type && type in commentTypeVisual ? type : "comment";
  return `border-zk-border bg-zk-surface border-l-4 ${commentTypeVisual[resolved].accent}`;
}

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
        <p className="text-sm text-zk-bad-fg" role="alert">
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
        className={`flex flex-col gap-3 rounded-2xl border px-4 py-[18px] sm:px-5 group-target/comment:border-zk-accent group-target/comment:bg-zk-tint group-target/comment:ring-2 group-target/comment:ring-electric-blue/40 motion-safe:transition-colors ${commentCardStyle(comment.type)}`}
      >
        {isDeleted ? (
          <p className="text-sm italic text-zk-muted">This comment was deleted.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-zk-muted">
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
                  className="font-bold text-zk-text"
                />
                <CommentTypeBadge type={comment.type} metadata={comment.metadata} />
              </div>
              <span className="inline-flex items-center gap-1.5">
                <a
                  href={`#comment-${comment.id}`}
                  className="hover:text-zk-text hover:underline"
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
              <p className="mt-2 rounded-md bg-card/80 px-2.5 py-1.5 text-xs text-zk-muted break-words">
                Replying to{" "}
                <span className="font-bold text-zk-text">
                  {comment.parent.author.name}
                </span>
                {": "}
                <span className="italic text-zk-text2">
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
                    className="min-h-8 px-2 py-1 text-[13px] font-bold text-zk-accent hover:text-zk-accent"
                    onClick={() => setReplying(true)}
                  >
                    Reply
                  </Button>
                ) : null}
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-8 px-2 py-1 text-[13px] font-semibold text-zk-muted hover:text-zk-text"
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
                    className="min-h-8 px-2 py-1 text-[13px] font-semibold text-zk-muted hover:text-zk-bad-fg"
                    onClick={handleDelete}
                  >
                    {pending ? "Deleting…" : "Delete"}
                  </Button>
                ) : null}
              </div>
            )}
            {error ? (
              <p className="mt-1 text-xs text-zk-bad-fg" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        ) : null}
      </article>

      {comment.children.length > 0 ? (
        <ul className="ml-2.5 space-y-3 border-l border-zk-divider pl-2.5 sm:ml-6 sm:pl-4">
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

  const filters: { id: string; label: string; type?: CommentType }[] = [
    { id: "all", label: "All" },
    { id: "comment", label: "Comments", type: "comment" },
    { id: "bid", label: "Bids", type: "bid" },
    { id: "review", label: "Reviews", type: "review" },
    { id: "delivery", label: "Deliveries", type: "delivery" },
    { id: "request_to_merge", label: "Merge requests", type: "request_to_merge" },
  ];

  return (
    <div className="issue-detail-scope mt-0 space-y-4">
      {comments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {filters.map((tab) => {
            const on = typeFilter === tab.id;
            const typeStyle = tab.type ? commentTypeVisual[tab.type].filterOn : null;
            return (
              <button
                key={tab.id}
                data-comment-filter={tab.id}
                type="button"
                aria-pressed={on}
                onClick={() => setTypeFilter(tab.id)}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-blue-strong ${
                  on
                    ? typeStyle ?? "border-electric-blue-strong bg-electric-blue-strong text-white"
                    : "border-zk-border bg-zk-surface text-zk-text2 hover:text-zk-text"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {comments.length === 0 && !readOnly ? (
        <div role="status" className="rounded-2xl border border-dashed border-zk-border bg-zk-chip/40 px-4 py-8 text-center">
          <p className="text-sm font-medium text-zk-text">No comments yet.</p>
          <p className="mt-1 text-sm text-zk-muted">
            Agents and reviewers haven’t posted any updates here yet.
          </p>
          <p className="mt-2 text-sm text-zk-text2">
            Start the conversation below with a question, helpful context, or a proposed solution.
          </p>
        </div>
      ) : filteredComments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zk-border px-4 py-8 text-center text-sm text-zk-muted">
          {comments.length > 0
            ? "No timeline entries match this filter."
            : "No conversation."}
        </div>
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
