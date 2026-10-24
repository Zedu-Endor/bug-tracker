import Link from "next/link";
import type { ReactNode } from "react";
import { LocalTime } from "@/components/local-time";
import { UserNameWithBadges } from "@/components/user-name-with-badges";
import { SelfAssignButton } from "@/components/self-assign-button";
import { MilestoneDue } from "@/components/milestone-due";
import { dueDateValue, milestoneIssuesHref } from "@/lib/milestones";
import { getIssueTypeBadgeClass } from "@/lib/issue-type-styles";
import type { OrganizationRole } from "@/lib/organization-role";
import type { AppRole } from "@/lib/roles";

export interface IssueMetadataCardProps {
  bug: {
    id: string;
    number: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    reporter: {
      name: string;
      role?: AppRole | null;
      image?: string | null;
    };
    reporterId: string;
    assignee?: {
      name: string;
      role?: AppRole | null;
      image?: string | null;
    } | null;
    assigneeId?: string | null;
    createdByAgent?: {
      name: string;
    } | null;
    category?: {
      name: string;
    } | null;
    area?: {
      name: string;
    } | null;
    type?: {
      name: string;
    } | null;
    milestone?: {
      id: string;
      title: string;
      dueDate?: Date | string | null;
      isClosed?: boolean;
    } | null;
  };
  lastActivityAt?: Date | string | null;
  reporterOrganizationRole?: OrganizationRole | null;
  assigneeOrganizationRole?: OrganizationRole | null;
  organizationRoles?: Record<string, OrganizationRole | null | undefined>;
  canSelfAssign?: boolean;
  isAssignee?: boolean;
  children?: ReactNode;
}

export function IssueMetadataCard({
  bug,
  lastActivityAt,
  reporterOrganizationRole,
  assigneeOrganizationRole,
  organizationRoles = {},
  canSelfAssign = false,
  isAssignee = false,
  children,
}: IssueMetadataCardProps) {
  const updatedTimestamp = lastActivityAt || bug.updatedAt;

  return (
    <div
      data-testid="issue-metadata-card"
      className="mt-6 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 sm:p-5 shadow-2xs"
    >
      <div className="border-b border-slate-200/80 pb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Issue Details & Context
        </h3>
      </div>

      <dl className="mt-3.5 grid grid-cols-1 gap-x-4 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-4 text-xs min-w-0">
        {/* Reporter */}
        <div className="min-w-0 space-y-1">
          <dt className="font-medium text-slate-500">Reporter</dt>
          <dd className="min-w-0 text-slate-800">
            <UserNameWithBadges
              name={bug.reporter.name}
              role={bug.reporter.role}
              organizationRole={reporterOrganizationRole ?? organizationRoles[bug.reporterId]}
              image={bug.reporter.image}
              avatar="sm"
              userId={bug.reporterId}
              agentName={bug.createdByAgent?.name}
              showAuthor
            />
          </dd>
        </div>

        {/* Assignee */}
        <div className="min-w-0 space-y-1">
          <dt className="font-medium text-slate-500">Assignee</dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-slate-800">
            {bug.assignee ? (
              <UserNameWithBadges
                name={bug.assignee.name}
                role={bug.assignee.role}
                organizationRole={assigneeOrganizationRole ?? (bug.assigneeId ? organizationRoles[bug.assigneeId] : null)}
                image={bug.assignee.image}
                avatar="sm"
                userId={bug.assigneeId}
              />
            ) : (
              <span className="text-slate-500 italic">Unassigned</span>
            )}
            {canSelfAssign && (
              <SelfAssignButton
                bugId={bug.id}
                isAssignedToMe={isAssignee}
                variant="ghost"
                size="xs"
              />
            )}
          </dd>
        </div>

        {/* Created Timestamp */}
        <div className="min-w-0 space-y-1">
          <dt className="font-medium text-slate-500">Created</dt>
          <dd className="font-normal text-slate-700">
            <LocalTime date={bug.createdAt} />
          </dd>
        </div>

        {/* Last Activity / Updated */}
        <div className="min-w-0 space-y-1">
          <dt className="font-medium text-slate-500">Last activity</dt>
          <dd className="font-normal text-slate-700">
            <LocalTime date={updatedTimestamp} />
          </dd>
        </div>

        {/* Platform / Category */}
        {bug.category ? (
          <div className="min-w-0 space-y-1">
            <dt className="font-medium text-slate-500">Platform</dt>
            <dd className="font-medium text-slate-800">{bug.category.name}</dd>
          </div>
        ) : null}

        {/* Area */}
        {bug.area ? (
          <div className="min-w-0 space-y-1">
            <dt className="font-medium text-slate-500">Area</dt>
            <dd className="font-medium text-slate-800">{bug.area.name}</dd>
          </div>
        ) : null}

        {/* Issue Type */}
        {bug.type ? (
          <div className="min-w-0 space-y-1">
            <dt className="font-medium text-slate-500">Type</dt>
            <dd>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-2xs font-medium ${getIssueTypeBadgeClass(
                  bug.type.name,
                )}`}
              >
                {bug.type.name}
              </span>
            </dd>
          </div>
        ) : null}

        {/* Milestone */}
        {bug.milestone ? (
          <div className="min-w-0 space-y-1">
            <dt className="font-medium text-slate-500">Milestone</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-slate-800">
              <Link
                href={milestoneIssuesHref(bug.milestone.id)}
                className="font-medium text-teal-700 hover:underline truncate max-w-[130px]"
                title={bug.milestone.title}
              >
                {bug.milestone.title}
              </Link>
              <MilestoneDue
                due={dueDateValue(bug.milestone.dueDate) || null}
                isClosed={bug.milestone.isClosed}
              />
            </dd>
          </div>
        ) : null}
      </dl>

      {children}
    </div>
  );
}
