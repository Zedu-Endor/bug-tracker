import { describe, expect, it } from "vitest";
import { confirmationCount, intakeKind, isConfirmedCount, issueStage, openIssueStages, parseIssueStageView } from "./issue-stage";

const bug = { beneficiaryUserId: "beneficiary", reporterId: "reporter", createdByAgent: null, claims: [] };

describe("issueStage", () => {
  it("calls every unconfirmed open issue reported, whoever filed it", () => {
    expect(issueStage({ status: "open", voteCount: 0, confirmed: false })).toBe("reported");
    expect(issueStage({ status: "open", voteCount: 5, confirmed: false })).toBe("reported");
  });

  it("calls a confirmed issue with fewer than three upvotes confirmed", () => {
    expect(issueStage({ status: "open", voteCount: 2, confirmed: true })).toBe("confirmed");
  });

  it("calls a confirmed issue with three upvotes ready", () => {
    expect(issueStage({ status: "open", voteCount: 3, confirmed: true })).toBe("ready");
    expect(issueStage({ status: "open", voteCount: 8, confirmed: true })).toBe("ready");
  });

  it("leaves the work status alone once someone starts it", () => {
    expect(issueStage({ status: "in_progress", voteCount: 4, confirmed: true })).toBeNull();
    expect(issueStage({ status: "resolved", voteCount: 0, confirmed: false })).toBeNull();
  });
});

describe("confirmationCount", () => {
  it("excludes legacy reviews credited to the reporter from displayed confirmation counts", () => {
    expect(confirmationCount({
      createdByAgentId: "filer", undoneIds: new Set(), bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one", onBehalfOfUserId: "reporter" },
        { id: "v2", agentId: "b", ownerUserId: "two", onBehalfOfUserId: "two" },
      ],
    })).toBe(1);
  });
  it("confirms on two independent owners", () => {
    const count = confirmationCount({
      createdByAgentId: "filer",
      undoneIds: new Set(),
      bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one" },
        { id: "v2", agentId: "b", ownerUserId: "two" },
      ],
    });
    expect(count).toBe(2);
    expect(isConfirmedCount(count)).toBe(true);
  });

  it("does not confirm two accepts from the same owner, the filer, or an undone review", () => {
    const count = confirmationCount({
      createdByAgentId: "filer",
      undoneIds: new Set(["gone"]),
      bug,
      accepts: [
        { id: "v1", agentId: "a", ownerUserId: "one" },
        { id: "v2", agentId: "b", ownerUserId: "one" },
        { id: "own", agentId: "filer", ownerUserId: "three" },
        { id: "gone", agentId: "c", ownerUserId: "four" },
        { id: "self", agentId: "d", ownerUserId: "reporter" },
      ],
    });
    expect(isConfirmedCount(count)).toBe(false);
  });
});

describe("intake", () => {
  it("keeps an open report an idea until it is confirmed and upvoted", () => {
    expect(intakeKind({ status: "open", voteCount: 5, confirmed: false })).toBe("idea");
    expect(intakeKind({ status: "open", voteCount: 2, confirmed: true })).toBe("idea");
    expect(intakeKind({ status: "open", voteCount: 3, confirmed: true })).toBe("issue");
  });

  it("keeps a started or finished report an issue", () => {
    expect(intakeKind({ status: "in_progress", voteCount: 4, confirmed: true })).toBe("issue");
    expect(intakeKind({ status: "closed", voteCount: 0, confirmed: false })).toBe("idea");
  });
});

describe("parseIssueStageView", () => {
  it("keeps the idea filters and the issue filter", () => {
    expect(parseIssueStageView("reported")).toBe("reported");
    expect(parseIssueStageView("confirmed")).toBe("confirmed");
    expect(parseIssueStageView("ready")).toBe("ready");
    expect(parseIssueStageView(undefined)).toBeNull();
  });
});

describe("openIssueStages", () => {
  const row = {
    id: "issue-1",
    projectId: "project-1",
    status: "open",
    voteCount: 3,
    beneficiaryUserId: "beneficiary",
    reporterId: "reporter",
    createdByAgentId: null,
    createdByAgent: null,
    claims: [],
  };
  const accepts = [
    { id: "v1", bugId: row.id, createdAt: new Date("2026-10-20T10:00:00Z"), agentId: "a1", agent: { ownerUserId: "one" } },
    { id: "v2", bugId: row.id, createdAt: new Date("2026-10-20T10:01:00Z"), agentId: "a2", agent: { ownerUserId: "two" } },
  ];
  const clear = (over: Record<string, unknown> = {}) => ({
    id: "c1",
    bugId: row.id,
    createdAt: new Date("2026-10-20T11:00:00Z"),
    agentId: "t1",
    agent: { id: "t1", ownerUserId: "triager-owner", level: "triager" },
    ...over,
  });
  function db(clears: unknown[] = [], revisions: unknown[] = [], undone: unknown[] = []) {
    return {
      bug: { findMany: async () => [row] },
      bugRevision: { findMany: async () => revisions },
      issueValidation: {
        findMany: async (args: { where: { kind?: string } }) => (args.where.kind === "duplicate" ? clears : accepts),
      },
      agentAuditEvent: { findMany: async () => undone },
    };
  }
  const stage = async (clears: unknown[] = [], revisions: unknown[] = [], undone: unknown[] = []) =>
    (await openIssueStages(db(clears, revisions, undone) as never, {})).get(row.id);

  it("does not call an issue ready until the triage clearance is in", async () => {
    expect(await stage()).toBe("reported");
  });

  it("calls it ready once an independent triager has cleared it", async () => {
    expect(await stage([clear()])).toBe("ready");
  });

  it("ignores a duplicate clearance from a reviewer-level agent", async () => {
    expect(
      await stage([clear({ agent: { id: "r1", ownerUserId: "reviewer-owner", level: "reviewer" } })]),
    ).toBe("reported");
  });

  it("ignores a clearance made before the latest edit and an undone one", async () => {
    const editedAt = new Date("2026-10-21T00:00:00Z");
    expect(await stage([clear({ createdAt: new Date("2026-10-20T00:00:00Z") })], [{ bugId: row.id, editedAt }])).toBe("reported");
    expect(await stage([clear()], [], [{ bugId: row.id, payload: { validationId: "c1" } }])).toBe("reported");
  });
});
