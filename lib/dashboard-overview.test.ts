import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { prisma } from "./prisma";
import {
  AGENT_IDLE_WINDOW_MS,
  PREVIEW_LIMIT,
  RESOLVED_STATUSES,
  UNRESOLVED_STATUSES,
  classifyAgentStatus,
  firstCloseForTenant,
  isResolvedStatus,
  isUnresolvedStatus,
  loadSidebarCounts,
} from "./dashboard-overview";
import { isDone } from "./issue-state";

const ALL_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;

describe("dashboard overview counts (#dashboard)", () => {
  it("shows exactly three preview rows per card", () => {
    expect(PREVIEW_LIMIT).toBe(3);
  });

  it("partitions every issue into unresolved or resolved, never both", () => {
    for (const status of ALL_STATUSES) {
      const unresolved = isUnresolvedStatus(status);
      const resolved = isResolvedStatus(status);
      expect(unresolved || resolved).toBe(true);
      expect(unresolved && resolved).toBe(false);
    }
  });

  it("matches the app's finished convention (isDone)", () => {
    for (const status of ALL_STATUSES) {
      expect(isResolvedStatus(status)).toBe(isDone(status));
    }
  });

  it("scopes the first-close aggregate to one workspace", () => {
    const sql = firstCloseForTenant("tenant-acme");
    const text = sql.strings.join(" ");
    expect(text).toContain('bug."tenantId"');
    expect(text).toContain('bug."isDeleted"');
    expect(text).not.toMatch(/FROM "BugActivity" a\s+WHERE/);
    expect(sql.values).toContain("tenant-acme");
  });

  it("counts open + in progress as unresolved and resolved + closed as resolved", () => {
    expect([...UNRESOLVED_STATUSES]).toEqual(["open", "in_progress"]);
    expect([...RESOLVED_STATUSES]).toEqual(["resolved", "closed"]);
    // Together they cover the whole Status enum — no issue is left uncounted.
    expect(new Set([...UNRESOLVED_STATUSES, ...RESOLVED_STATUSES])).toEqual(
      new Set(ALL_STATUSES),
    );
  });

  it("rejects non-status strings", () => {
    expect(isUnresolvedStatus("deleted")).toBe(false);
    expect(isResolvedStatus("deleted")).toBe(false);
    expect(isUnresolvedStatus("")).toBe(false);
    expect(isResolvedStatus("")).toBe(false);
  });
});

describe("classifyAgentStatus (#dashboard)", () => {
  const now = new Date("2026-05-01T12:00:00Z");
  const minutesAgo = (minutes: number) =>
    new Date(now.getTime() - minutes * 60 * 1000);

  it("an unanswered question outranks everything: Waiting on you", () => {
    expect(
      classifyAgentStatus({
        hasUnansweredQuestion: true,
        hasActiveClaim: true,
        lastSeenAt: minutesAgo(1),
        now,
      }),
    ).toBe("waiting");
  });

  it("a live claim is Working", () => {
    expect(
      classifyAgentStatus({
        hasUnansweredQuestion: false,
        hasActiveClaim: true,
        lastSeenAt: null,
        now,
      }),
    ).toBe("working");
  });

  it("recent activity without work is Idle", () => {
    expect(
      classifyAgentStatus({
        hasUnansweredQuestion: false,
        hasActiveClaim: false,
        lastSeenAt: minutesAgo(60),
        now,
      }),
    ).toBe("idle");
  });

  it("no recent signal at all is Offline", () => {
    expect(
      classifyAgentStatus({
        hasUnansweredQuestion: false,
        hasActiveClaim: false,
        lastSeenAt: minutesAgo(60 * 24 * 2),
        now,
      }),
    ).toBe("offline");
    expect(
      classifyAgentStatus({
        hasUnansweredQuestion: false,
        hasActiveClaim: false,
        lastSeenAt: null,
        now,
      }),
    ).toBe("offline");
  });

  it("treats exactly the idle window as still seen", () => {
    expect(
      classifyAgentStatus({
        hasUnansweredQuestion: false,
        hasActiveClaim: false,
        lastSeenAt: new Date(now.getTime() - AGENT_IDLE_WINDOW_MS),
        now,
      }),
    ).toBe("idle");
    expect(
      classifyAgentStatus({
        hasUnansweredQuestion: false,
        hasActiveClaim: false,
        lastSeenAt: new Date(now.getTime() - AGENT_IDLE_WINDOW_MS - 1),
        now,
      }),
    ).toBe("offline");
  });
});

describe("loadSidebarCounts (#591)", () => {
  it("filters assigned and reported counts by unresolved statuses to match list defaults", async () => {
    const countSpy = vi.spyOn(prisma.bug, "count").mockResolvedValue(4);
    const counts = await loadSidebarCounts({ userId: "user-1", tenantId: "tenant-1" });
    expect(counts).toEqual({ unresolved: 4, assigned: 4, reported: 4 });
    expect(countSpy).toHaveBeenCalledTimes(3);
    const calls = countSpy.mock.calls;
    expect(calls[0][0]?.where).toMatchObject({
      tenantId: "tenant-1",
      isDeleted: false,
      status: { in: [...UNRESOLVED_STATUSES] },
    });
    expect(calls[1][0]?.where).toMatchObject({
      tenantId: "tenant-1",
      assigneeId: "user-1",
      isDeleted: false,
      status: { in: [...UNRESOLVED_STATUSES] },
    });
    expect(calls[2][0]?.where).toMatchObject({
      tenantId: "tenant-1",
      reporterId: "user-1",
      isDeleted: false,
      status: { in: [...UNRESOLVED_STATUSES] },
    });
    countSpy.mockRestore();
  });

  it("returns zeros when tenantId is null", async () => {
    const counts = await loadSidebarCounts({ userId: "user-1", tenantId: null });
    expect(counts).toEqual({ unresolved: 0, assigned: 0, reported: 0 });
  });
});