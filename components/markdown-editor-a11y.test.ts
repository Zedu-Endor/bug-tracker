import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownEditor } from "./markdown-editor";

describe("MarkdownEditor accessibility (#146)", () => {
  it("renders role='combobox' and aria-expanded when mentions are enabled", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownEditor, {
        value: "Hello world",
        onChange: () => {},
        users: [{ id: "u1", name: "Ada" }],
      }),
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("does not render role='combobox' or aria-expanded when mentions are disabled", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownEditor, {
        value: "Hello world",
        onChange: () => {},
        users: [],
      }),
    );
    expect(html).not.toContain('role="combobox"');
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain('aria-autocomplete="list"');
  });

  it("uses text-slate-500 for the character counter to satisfy WCAG AA contrast (>=4.5:1)", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownEditor, {
        value: "Test text",
        onChange: () => {},
        maxLength: 2000,
      }),
    );
    expect(html).toContain("tabular-nums text-slate-500");
    expect(html).not.toContain("tabular-nums text-slate-400");
    expect(html).toContain("9/2000");
  });

  it("does not clip mentions dropdown with overflow-hidden on the editor shell (#200)", () => {
    const html = renderToStaticMarkup(
      createElement(MarkdownEditor, {
        value: "Test text",
        onChange: () => {},
        users: [{ id: "u1", name: "Ada" }],
      }),
    );
    expect(html).not.toContain("overflow-hidden rounded-lg border border-slate-300");
    expect(html).toContain("rounded-lg border border-slate-300");
  });
});
