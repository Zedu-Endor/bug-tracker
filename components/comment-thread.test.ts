import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/actions/comments", () => ({
  deleteCommentAction: vi.fn(),
  updateCommentAction: vi.fn(),
  createCommentAction: vi.fn(),
}));

import { CommentThread } from "./comment-thread";
import type { CommentNode } from "@/lib/comments";

describe("CommentThread permalinks (#142)", () => {
  it("renders comment id, scroll-mt-24, and timestamp permalink anchor", () => {
    const comments: CommentNode[] = [
      {
        id: "c1",
        authorId: "u1",
        parentId: null,
        body: "First comment",
        createdAt: new Date("2026-10-16T12:00:00Z"),
        editedAt: null,
        deletedAt: null,
        depth: 0,
        author: {
          name: "Alice",
          role: "user",
        },
        parent: null,
        children: [],
      },
    ];

    const html = renderToStaticMarkup(
      createElement(CommentThread, {
        bugId: "b1",
        issueUrl: "https://issues.example/bugs/b1",
        reporterId: "u1",
        comments,
        users: [{ id: "u1", name: "Alice" }],
      }),
    );

    expect(html).toContain('id="comment-c1"');
    expect(html).toContain("scroll-mt-24");
    expect(html).toContain('href="#comment-c1"');
    // A permalink copy control beside the timestamp, with a real name (#279).
    expect(html).toContain('aria-label="Copy link to this comment"');
  });
});

describe("CommentThread read-only mode (#122)", () => {
  const comments: CommentNode[] = [
    {
      id: "c1",
      authorId: "u1",
      parentId: null,
      body: "First comment",
      createdAt: new Date("2026-10-16T12:00:00Z"),
      editedAt: null,
      deletedAt: null,
      depth: 0,
      author: { name: "Alice", role: "user" },
      parent: null,
      children: [],
    },
  ];

  const render = (readOnly: boolean) =>
    renderToStaticMarkup(
      createElement(CommentThread, {
        bugId: "b1",
        issueUrl: "https://issues.example/bugs/b1",
        reporterId: "u1",
        comments,
        users: [{ id: "u1", name: "Alice" }],
        currentUserId: "u1",
        currentUserRole: "user",
        readOnly,
      }),
    );

  it("shows the comment form and Reply on a normal issue", () => {
    const html = render(false);
    expect(html).toContain("<form");
    expect(html).toContain(">Reply<");
  });

  it.each([0, 85, 100])("renders self-reported confidence %s for agent comments and reviews", (confidence) => {
    for (const type of ["comment", "review"] as const) {
      const html = renderToStaticMarkup(createElement(CommentThread, {
        bugId: "b1", issueUrl: "https://issues.example/bugs/b1", reporterId: "u2", users: [],
        comments: [{ ...comments[0], agentId: "agent1", agent: { name: "Reviewer" }, type,
          metadata: { confidence, confidenceReason: "Source inspected; not reproduced." } }],
      }));
      expect(html).toContain(`Self-reported confidence: ${confidence}%`);
      expect(html).toContain("Source inspected; not reproduced.");
    }
  });

  it.each([undefined, { confidence: 101 }, { confidence: "80" }, { confidence: -1 }])("hides missing or invalid legacy confidence", (metadata) => {
    const html = renderToStaticMarkup(createElement(CommentThread, {
      bugId: "b1", issueUrl: "https://issues.example/bugs/b1", reporterId: "u2", users: [],
      comments: [{ ...comments[0], agentId: "agent1", metadata }],
    }));
    expect(html).not.toContain("Self-reported confidence:");
  });

  it("renders structured comment badges like bid and delivery (#747)", () => {
    const comments: CommentNode[] = [
      {
        id: "c-bid",
        authorId: "u1",
        parentId: null,
        body: "I bid 2 hours",
        type: "bid",
        metadata: { eta: "2 hours" },
        createdAt: new Date("2026-10-16T12:00:00Z"),
        editedAt: null,
        deletedAt: null,
        depth: 0,
        author: { name: "Agent Alpha", role: "user" },
        parent: null,
        children: [],
      },
      {
        id: "c-del",
        authorId: "u1",
        parentId: null,
        body: "Delivered PR",
        type: "delivery",
        metadata: { prUrl: "https://github.com/pr/1" },
        createdAt: new Date("2026-10-16T12:00:00Z"),
        editedAt: null,
        deletedAt: null,
        depth: 0,
        author: { name: "Agent Alpha", role: "user" },
        parent: null,
        children: [],
      },
    ];

    const html = renderToStaticMarkup(
      createElement(CommentThread, {
        bugId: "b1",
        issueUrl: "https://issues.example/bugs/b1",
        reporterId: "u1",
        comments,
        users: [{ id: "u1", name: "Agent Alpha" }],
      }),
    );

    expect(html).toContain("Bid");
    expect(html).toContain("ETA: 2 hours");
    expect(html).toContain("Delivery");
    expect(html).toContain('href="https://github.com/pr/1"');
  });

  it("renders distinct review verdict badges, request_to_merge, and agent comment badge (#455)", () => {
    const comments: CommentNode[] = [
      {
        id: "c-rev-accept",
        authorId: "u1",
        parentId: null,
        body: "Looks good to me",
        type: "review",
        metadata: { verdict: "accept" },
        createdAt: new Date("2026-10-16T12:00:00Z"),
        editedAt: null,
        deletedAt: null,
        depth: 0,
        author: { name: "Reviewer One", role: "user" },
        parent: null,
        children: [],
      },
      {
        id: "c-rev-reject",
        authorId: "u2",
        parentId: null,
        body: "Needs changes",
        type: "review",
        metadata: { verdict: "reject" },
        createdAt: new Date("2026-10-16T12:05:00Z"),
        editedAt: null,
        deletedAt: null,
        depth: 0,
        author: { name: "Reviewer Two", role: "user" },
        parent: null,
        children: [],
      },
      {
        id: "c-merge",
        authorId: "u1",
        parentId: null,
        body: "Ready to merge",
        type: "request_to_merge",
        metadata: null,
        createdAt: new Date("2026-10-16T12:10:00Z"),
        editedAt: null,
        deletedAt: null,
        depth: 0,
        author: { name: "Agent Alpha", role: "user" },
        parent: null,
        children: [],
      },
      {
        id: "c-agent-std",
        authorId: "u1",
        parentId: null,
        body: "Diagnostic report attached",
        type: "comment",
        agentId: "agent-123",
        agent: { name: "DiagnosticAgent" },
        metadata: null,
        createdAt: new Date("2026-10-16T12:15:00Z"),
        editedAt: null,
        deletedAt: null,
        depth: 0,
        author: { name: "Agent Owner", role: "user" },
        parent: null,
        children: [],
      },
    ];

    const html = renderToStaticMarkup(
      createElement(CommentThread, {
        bugId: "b1",
        issueUrl: "https://issues.example/bugs/b1",
        reporterId: "u1",
        comments,
        users: [{ id: "u1", name: "User" }],
      }),
    );

    expect(html).toContain("Review");
    expect(html).toContain("· accept");
    expect(html).toContain("· reject");
    expect(html).toContain("Request to Merge");
    expect(html).toContain("Agent Comment");
  });
});

describe("CommentThread Admin label (#489)", () => {
  const comment = (id: string, authorId: string, role: "user" | "admin"): CommentNode => ({
    id,
    authorId,
    parentId: null,
    body: `Comment ${id}`,
    createdAt: new Date("2026-10-21T12:00:00Z"),
    editedAt: null,
    deletedAt: null,
    depth: 0,
    author: { name: `Person ${authorId}`, role },
    parent: null,
    children: [],
  });

  const render = (organizationRoles?: Record<string, "owner" | "admin" | "member">) =>
    renderToStaticMarkup(
      createElement(CommentThread, {
        bugId: "b1",
        issueUrl: "https://issues.example/bugs/b1",
        reporterId: "r1",
        comments: [comment("c1", "u1", "admin"), comment("c2", "u2", "user")],
        users: [],
        organizationRoles,
      }),
    );

  it("labels only authors who are admins of this organization", () => {
    const html = render({ u1: "member", u2: "admin" });
    expect(html.match(/aria-label="Administrator"/g)).toHaveLength(1);
    const second = html.slice(html.indexOf('id="comment-c2"'));
    expect(second).toContain('aria-label="Administrator"');
  });

  it("does not label an account-wide admin when no organization role is known", () => {
    expect(render()).not.toContain('aria-label="Administrator"');
  });
});
