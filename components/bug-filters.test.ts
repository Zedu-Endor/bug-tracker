import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("page=2&q=crash"),
}));

describe("BugFilters (#132, #361)", () => {
  it("renders correctly with search param default value", async () => {
    const { BugFilters } = await import("./bug-filters");
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");

    const html = renderToStaticMarkup(createElement(BugFilters));
    expect(html).toContain('value="crash"');
  });

  it("displays keyboard shortcut hint in placeholder and kbd badge", async () => {
    const { BugFilters } = await import("./bug-filters");
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");

    const html = renderToStaticMarkup(createElement(BugFilters));
    expect(html).toContain('placeholder="Search, or type a tag like Design (/)"');
  });

  it("handles keyboard shortcut listener properly in source code", async () => {
    const { readFileSync } = await import("fs");
    const source = readFileSync("components/bug-filters.tsx", "utf8");

    expect(source).toContain('window.addEventListener("keydown", handleKeyDown)');
    expect(source).toContain('window.removeEventListener("keydown", handleKeyDown)');
    expect(source).toContain('event.key === "/"');
    expect(source).toContain('event.key.toLowerCase() === "k"');
    expect(source).toContain("event.isComposing");
    expect(source).toContain("isSlash && isEditable");
    expect(source).toContain("inputRef.current?.focus()");
    expect(source).toContain("inputRef.current?.select()");
  });
});
