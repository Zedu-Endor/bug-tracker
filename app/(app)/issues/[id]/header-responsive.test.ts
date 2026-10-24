import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
const source = readFileSync(path.resolve(__dirname, "page.tsx"), "utf8");
const css = readFileSync(path.resolve(__dirname, "issue-detail.css"), "utf8");

describe("Prototype detail layout", () => {
  it("keeps navigation beside a compact title that can reveal the full text", () => {
    const header = source.slice(source.indexOf('<header className="issue-heading">'), source.indexOf('<div className="issue-heading-meta">'));
    expect(header).toMatch(/aria-label="Back to issues"[\s\S]*issue-heading-line[\s\S]*<h1[^>]*><span className="issue-heading-number"/);
    expect(css).toContain("overflow-wrap:anywhere");
  });
  it("keeps status and severity visible, with role-gated controls in secondary disclosure", () => {
    expect(source).toMatch(/issueStatusChipClass\[bug.status\][\s\S]*issueSeverityChipClass\[bug.severity\]/);
    expect(source).toContain('<IssueActionsDialog />');
    expect(source).toContain('canSelfAssign');
    expect(source).not.toContain("<UpdateIssueForm");
    expect(source).not.toContain("<DeleteIssueButton");
  });
  it("uses the same content column for reading and tabs, stacking metadata on small screens", () => {
    expect(source).toContain('description={descriptionContent}');
    expect(source).toContain('conversation={discussionContent}');
    expect(source).toContain('decisions={decisionsContent}');
    expect(source).toContain('activity={activityContent}');
    expect(css).toContain('@media(max-width:850px)');
    expect(css).toContain('grid-template-columns:minmax(0,1fr)');
  });
});
