import Link from "next/link";
import { AdminBadge } from "@/components/admin-badge";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import type { AvatarSize } from "@/lib/avatar";
import { authorBadgeClass } from "@/lib/labels";
import type { AppRole } from "@/lib/roles";
import { isOrganizationAdmin, type OrganizationRole } from "@/lib/organization-role";

export function UserNameWithBadges({
  name,
  role,
  organizationRole,
  userId,
  showAuthor = false,
  agentName,
  avatar,
  image,
  className = "",
}: {
  name: string;
  /** Account-wide role. On its own it only labels the site's super admin. */
  role?: AppRole | null;
  /**
   * The person's role in the organization this page belongs to (#489). The
   * Admin label follows it, the same rule as admin powers: an admin of another
   * organization who is only a member here is not labelled Admin here.
   */
  organizationRole?: OrganizationRole | null;
  /**
   * Links the name to that person's profile. Leave it out anywhere the name
   * already sits inside a link — a list row, say — because a link inside a
   * link is invalid and the inner one is unreachable by keyboard.
   */
  userId?: string | null;
  showAuthor?: boolean;
  /** Shows agent attribution e.g. "via cara_reviewer (agent)" (#578). */
  agentName?: string | null;
  /** Draw the person's avatar before the name, at this size (#290). */
  avatar?: AvatarSize;
  image?: string | null;
  className?: string;
}) {
  return (
    <span className={`inline-flex max-w-full flex-wrap items-center gap-1.5 ${className}`}>
      {avatar ? <Avatar name={name} image={image} size={avatar} /> : null}
      {userId ? (
        <Link
          href={`/users/${userId}`}
          className="truncate rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {name}
        </Link>
      ) : (
        <span className="truncate">{name}</span>
      )}
      {agentName ? (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 text-[11px] font-normal text-ink-2 ring-1 ring-line"
          aria-label={`via ${agentName} (agent)`}
        >
          <span>via {agentName}</span>
          <span
            className="rounded bg-chip-2 px-1 text-[10px] font-medium text-ink-2"
            aria-hidden="true"
          >
            agent
          </span>
        </span>
      ) : null}
      {showAuthor ? <Badge className={authorBadgeClass}>Author</Badge> : null}
      {isOrganizationAdmin(organizationRole, role) ? <AdminBadge /> : null}
    </span>
  );
}
