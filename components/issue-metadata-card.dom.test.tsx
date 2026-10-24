// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IssueMetadataCard } from "./issue-metadata-card";

afterEach(cleanup);

vi.mock("@/components/self-assign-button", () => ({
  SelfAssignButton: () => <button type="button">Self assign</button>,
}));

vi.mock("@/components/user-name-with-badges", () => ({
  UserNameWithBadges: ({ name }: { name: string }) => <span>{name}</span>,
}));

vi.mock("@/components/local-time", () => ({
  LocalTime: ({ date }: { date: Date | string }) => (
    <time dateTime={new Date(date).toISOString()}>{new Date(date).toLocaleDateString()}</time>
  ),
}));

describe("IssueMetadataCard", () => {
  const mockBug = {
    id: "issue-1",
    number: 456,
    createdAt: new Date("2026-10-21T10:00:00Z"),
    updatedAt: new Date("2026-10-22T12:00:00Z"),
    reporter: { name: "Alice Reporter", role: "user" as const },
    reporterId: "user-1",
    assignee: { name: "Bob Assignee", role: "user" as const },
    assigneeId: "user-2",
    createdByAgent: { name: "Quantum-Agent" },
    category: { name: "Web Platform" },
    area: { name: "Navigation Area" },
    type: { name: "Bug" },
    milestone: {
      id: "ms-1",
      title: "v1.0 Milestone",
      dueDate: new Date("2026-11-01T00:00:00Z"),
      isClosed: false,
    },
  };

  it("renders compact structured metadata with distinct labels for created and last activity", () => {
    render(
      <IssueMetadataCard
        bug={mockBug}
        lastActivityAt={new Date("2026-10-22T14:00:00Z")}
        canSelfAssign={true}
        isAssignee={false}
      />,
    );

    expect(screen.getByText("Issue Details & Context")).toBeDefined();
    expect(screen.getByText("Reporter")).toBeDefined();
    expect(screen.getByText("Alice Reporter")).toBeDefined();
    expect(screen.getByText("Assignee")).toBeDefined();
    expect(screen.getByText("Bob Assignee")).toBeDefined();
    expect(screen.getByText("Created")).toBeDefined();
    expect(screen.getByText("Last activity")).toBeDefined();
    expect(screen.getByText("Web Platform")).toBeDefined();
    expect(screen.getByText("Navigation Area")).toBeDefined();
    expect(screen.getByText("v1.0 Milestone")).toBeDefined();
  });

  it("renders unassigned state cleanly when no assignee is present", () => {
    render(
      <IssueMetadataCard
        bug={{ ...mockBug, assignee: null, assigneeId: null }}
        canSelfAssign={true}
      />,
    );

    expect(screen.getByText("Unassigned")).toBeDefined();
    expect(screen.getByText("Self assign")).toBeDefined();
  });
});
