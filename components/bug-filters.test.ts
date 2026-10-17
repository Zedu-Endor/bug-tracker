import { describe, expect, it, vi } from "vitest";

const search = vi.hoisted(() => ({
  params: new URLSearchParams("page=2&q=crash"),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => search.params,
}));

/** Render the bar against a given query string. */
async function renderFilters(params: string) {
  search.params = new URLSearchParams(params);
  const { BugFilters } = await import("./bug-filters");
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");

  return renderToStaticMarkup(createElement(BugFilters));
}

describe("BugFilters (#132)", () => {
  it("renders correctly with search param default value", async () => {
    const html = await renderFilters("page=2&q=crash");
    expect(html).toContain('value="crash"');
  });
});

describe("BugFilters clear all filters (#336)", () => {
  it("shows the button when a filter is set", async () => {
    const html = await renderFilters("page=2&q=crash");
    expect(html).toContain("Clear all filters");
  });

  it("shows the button for every filter param", async () => {
    for (const params of [
      "q=crash",
      "tags=Design",
      "mine=assigned",
      "status=open",
      "severity=high",
      "platform=none",
      "sort=oldest",
    ]) {
      const html = await renderFilters(params);
      expect(html, params).toContain("Clear all filters");
    }
  });

  it("hides the button when only paging is set", async () => {
    const html = await renderFilters("page=2");
    expect(html).not.toContain("Clear all filters");
  });

  it("hides the button when a filter param is present but empty", async () => {
    const html = await renderFilters("q=&tags=&status=");
    expect(html).not.toContain("Clear all filters");
  });
});
