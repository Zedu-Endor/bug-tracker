import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";

/**
 * Guards the live character counters added to the create-issue and comment
 * forms. The comment box and the description field share MarkdownEditor, so
 * both are covered by the editor's counter; the title is a plain input and
 * gets its own.
 */
const createForm = readFileSync("components/create-bug-form.tsx", "utf8");
const markdownEditor = readFileSync("components/markdown-editor.tsx", "utf8");

describe("create issue form character counter", () => {
  it("renders a counter under the title, wired to the title value", () => {
    expect(createForm).toContain("<CharacterCounter");
    expect(createForm).toContain("length={values.title.length}");
    expect(createForm).toContain("max={TITLE_MAX_LENGTH}");
  });

  it("keeps the title max in one place", () => {
    expect(createForm).toContain("const TITLE_MAX_LENGTH = 200;");
    expect(createForm).toContain("maxLength={TITLE_MAX_LENGTH}");
    expect(createForm).not.toContain("maxLength={200}");
  });
});

describe("markdown editor character counter", () => {
  it("reuses the shared counter for maxLength fields", () => {
    expect(markdownEditor).toContain("<CharacterCounter");
    expect(markdownEditor).toContain("length={value.length}");
    expect(markdownEditor).toContain("max={maxLength}");
  });
});
