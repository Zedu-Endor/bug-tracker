import { createHmac, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { statusChangedSummary } from "@/lib/activity-log";
import { publish } from "@/lib/agent-api/events";
import { prisma } from "@/lib/prisma";
import { parseGitHubRepoUrl, sameRepo } from "@/lib/github/merge-pr";

/** True when `signature` is GitHub's `X-Hub-Signature-256` for this exact body. */
export function verifyGithubSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** What a merged pull request says it fixes, for issues it was never linked to. */
export type MergedPullRequestReference = {
  /** `repository.html_url` — identifies the project via `Project.repoUrl`. */
  repositoryUrl: string;
  /** `pull_request.title` and `pull_request.body`. */
  text: string[];
};

/**
 * Issue numbers a merged pull request closes: `Fixes #490`, `Closes: #490`,
 * `Resolves #490`, or a trailing `(#490)` in the title.
 */
export function extractClosedIssueNumbers(title: string | null | undefined, body: string | null | undefined): number[] {
  const numbers = new Set<number>();
  for (const text of [title, body]) {
    for (const m of (text ?? "").matchAll(/\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s*:?\s*#(\d{1,9})\b/gi)) numbers.add(Number(m[1]));
  }
  const trailing = (title ?? "").match(/\(#(\d{1,9})\)\s*$/);
  if (trailing) numbers.add(Number(trailing[1]));
  return [...numbers];
}

/**
 * #474: a pull request linked to an issue was merged on GitHub, not through
 * Ziki's merge gate. Resolve the issue, close its claim and tell pollers.
 * Solver points are not awarded here: they follow the review gates (a merger's
 * accept) or a person resolving the issue in the app.
 */
export async function resolveIssuesForMergedPullRequest(
  pullRequestUrl: string,
  db: PrismaClient = prisma,
  reference?: MergedPullRequestReference,
): Promise<string[]> {
  const select = {
    id: true, tenantId: true, projectId: true, status: true, assigneeId: true, reporterId: true,
    claims: { where: { status: "active", releasedAt: null }, select: { id: true, agentId: true, beneficiaryUserId: true } },
  } as const;
  const bugs = await db.bug.findMany({
    where: { pullRequestUrl, isDeleted: false, status: { not: "resolved" } },
    select,
  });
  // A pull request that was never linked (opened before the webhook existed, or
  // for a person-assigned issue, which has no claim to link with) still names
  // the issue it fixes. Merging needs repository write access, so an explicit
  // closing reference in a merged pull request is trusted; an issue already
  // linked to a different pull request is left alone.
  if (reference) {
    const repo = parseGitHubRepoUrl(reference.repositoryUrl);
    const numbers = extractClosedIssueNumbers(reference.text[0], reference.text[1]);
    if (repo && numbers.length) {
      const projects = await db.project.findMany({
        where: { repoUrl: { not: null } },
        select: { id: true, tenantId: true, repoUrl: true },
      });
      for (const project of projects) {
        const projectRepo = parseGitHubRepoUrl(project.repoUrl);
        if (!projectRepo || !sameRepo(projectRepo, repo)) continue;
        const named = await db.bug.findMany({
          where: {
            projectId: project.id, tenantId: project.tenantId, number: { in: numbers },
            isDeleted: false, status: { not: "resolved" }, pullRequestUrl: null,
          },
          select,
        });
        for (const bug of named) if (!bugs.some((b) => b.id === bug.id)) bugs.push(bug);
      }
    }
  }
  const resolved: string[] = [];
  for (const bug of bugs) {
    const didResolve = await db.$transaction(async (tx) => {
      // Re-check inside the transaction: a person resolving the issue, or a
      // redelivered webhook, may have won since the read above. Then there is
      // nothing to record or publish.
      const changed = await tx.bug.updateMany({
        where: { id: bug.id, status: { not: "resolved" } },
        data: { status: "resolved" },
      });
      if (changed.count !== 1) return false;
      await tx.bugActivity.create({
        data: {
          bugId: bug.id,
          actorId: bug.assigneeId ?? bug.claims[0]?.beneficiaryUserId ?? bug.reporterId,
          type: "status_changed",
          summary: statusChangedSummary(bug.status, "resolved"),
          metadata: { field: "status", from: bug.status, to: "resolved", via: "github_pull_request_merged", pullRequestUrl },
        },
      });
      await tx.issueClaim.updateMany({
        where: { bugId: bug.id, status: "active", releasedAt: null },
        data: { status: "released", releasedAt: new Date(), releaseReason: "resolved" },
      });
      for (const claim of bug.claims) {
        await publish(tx, {
          tenantId: bug.tenantId, type: "claim.released", actorAgentId: claim.agentId, bugId: bug.id,
          payload: { claimId: claim.id, issueId: bug.id, beneficiaryUserId: claim.beneficiaryUserId, reason: "resolved" },
        });
      }
      await publish(tx, {
        tenantId: bug.tenantId, type: "issue.updated", bugId: bug.id,
        payload: { issueId: bug.id, projectId: bug.projectId, changed: ["status"], values: { status: "resolved" }, source: "github" },
      });
      return true;
    });
    if (didResolve) resolved.push(bug.id);
  }
  return resolved;
}
