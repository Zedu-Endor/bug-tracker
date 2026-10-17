import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";

import { CopyLinkButton } from "./copy-link-button";

/**
 * There is no DOM harness here, so the click behaviour is guarded from the
 * source and the rendering assumptions are checked from the markup.
 */
const source = readFileSync("components/copy-link-button.tsx", "utf8");

describe("CopyLinkButton (#337)", () => {
  it("renders a small secondary button labelled Copy link", () => {
    const html = renderToStaticMarkup(createElement(CopyLinkButton));
    expect(html).toContain("Copy link");
    expect(html).toContain('aria-label="Copy link to this issue"');
    // Same shape as the watch button it sits next to.
    const classes = /class="([^"]+)"/.exec(html)?.[1].split(" ") ?? [];
    expect(classes).toEqual(
      expect.arrayContaining([
        "inline-flex",
        "items-center",
        "rounded-lg",
        "border",
        "border-slate-300",
        "bg-white",
        "text-slate-700",
        "hover:bg-slate-50",
        "px-3",
        "py-1.5",
        "text-sm",
        "font-medium",
      ]),
    );
  });

  it("announces the changed label politely", () => {
    const html = renderToStaticMarkup(createElement(CopyLinkButton));
    expect(html).toContain('aria-live="polite"');
  });

  it("copies the current page URL through the clipboard API", () => {
    expect(source).toContain("navigator.clipboard.writeText(window.location.href)");
    expect(source).toContain("try {");
    expect(source).toContain("} catch {");
  });

  it("reverts to 'Copy link' after about two seconds", () => {
    expect(source).toContain("setCopied(true)");
    expect(source).toMatch(/setTimeout\(\(\) => setCopied\(false\), 2000\)/);
  });
});
