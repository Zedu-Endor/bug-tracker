// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { selectTenantAction } from "@/app/(app)/tenants/actions";
import { AppSidebar } from "./app-sidebar";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <span data-testid="img" aria-hidden={props.alt === ""} />,
}));

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@/app/(app)/tenants/actions", () => ({
  selectTenantAction: vi.fn(),
}));

const selectTenant = vi.mocked(selectTenantAction);

afterEach(() => cleanup());

beforeEach(() => {
  navigation.pathname = "/dashboard";
  selectTenant.mockReset();
});

const workspaces = [
  { id: "t1", name: "Ziki", slug: "ziki" },
  { id: "t2", name: "Acme", slug: "acme" },
];

function renderSidebar(props?: Partial<Parameters<typeof AppSidebar>[0]>) {
  return render(
    <AppSidebar
      counts={{ unresolved: 4 }}
      workspaces={workspaces}
      activeTenantId="t1"
      {...props}
    />,
  );
}

describe("app sidebar", () => {
  it("keeps the three core destinations in view", () => {
    renderSidebar();
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("href")).toBe("/dashboard");
    expect(screen.getByRole("link", { name: /Issues/ }).getAttribute("href")).toBe(
      "/issues?project=all",
    );
    expect(screen.getByRole("link", { name: /Team/ }).getAttribute("href")).toBe(
      "/settings/team",
    );
  });

  it("marks the current destination", () => {
    navigation.pathname = "/issues";
    renderSidebar();
    expect(screen.getByRole("link", { name: /Issues/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /Overview/ }).getAttribute("aria-current")).toBeNull();
  });

  it("shows the live unresolved count", () => {
    renderSidebar({ counts: { unresolved: 12 } });
    expect(screen.getByText("12")).toBeTruthy();
  });

  it("switches workspace as soon as one is chosen", async () => {
    const user = userEvent.setup();
    renderSidebar();

    await user.click(screen.getByRole("button", { name: /active workspace, ziki/i }));
    await user.click(screen.getByRole("option", { name: "Acme" }));

    expect(selectTenant).toHaveBeenCalledTimes(1);
    const data = selectTenant.mock.calls[0][0] as FormData;
    expect(data.get("tenantId")).toBe("t2");
  });

  it("links to workspaces when the person has none", () => {
    renderSidebar({ workspaces: [], activeTenantId: null });
    expect(screen.queryByRole("button", { name: /active workspace/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Workspaces" }).getAttribute("href")).toBe("/tenants");
  });

  it("shows the slug when two workspaces share a name", async () => {
    const user = userEvent.setup();
    renderSidebar({
      workspaces: [
        { id: "t1", name: "Acme", slug: "acme" },
        { id: "t2", name: "Acme", slug: "acme-eu" },
      ],
      activeTenantId: "t1",
    });

    const trigger = screen.getByRole("button", { name: /active workspace, acme \(acme\)/i });
    expect(trigger.getAttribute("aria-label")).toBeNull();
    await user.click(trigger);
    expect(screen.getByRole("option", { name: "Acme (acme)" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Acme (acme-eu)" })).toBeTruthy();
  });

  it("remembers a collapsed rail in a cookie", async () => {
    const user = userEvent.setup();
    renderSidebar();
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });

    await user.click(toggle);

    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    expect(document.cookie).toContain("ziki_sidebar=collapsed");
  });
});
