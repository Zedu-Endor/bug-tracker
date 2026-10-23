// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { switchActiveRoleAction } from "@/app/actions/auth";
import { labelInNameMismatches } from "@/lib/a11y/label-in-name";
import { AppHeader } from "./app-header";

vi.mock("next/image", () => ({
  default: (props: { alt?: string }) => <span data-testid="img" aria-hidden={props.alt === ""} />,
}));

const navigation = vi.hoisted(() => ({ pathname: "/issues" }));
vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
}));

vi.mock("@/app/actions/auth", () => ({
  switchActiveRoleAction: vi.fn(),
  logoutAction: vi.fn(),
}));

vi.mock("@/app/actions/settings", () => ({
  setThemeAction: vi.fn(),
}));

const switchRole = vi.mocked(switchActiveRoleAction);

afterEach(() => cleanup());

beforeEach(() => {
  navigation.pathname = "/issues";
  switchRole.mockReset();
  switchRole.mockResolvedValue({ error: "refused" });
});

function renderHeader(props?: Partial<Parameters<typeof AppHeader>[0]>) {
  return render(
    <AppHeader
      {...{
        userName: "Ada Lovelace",
        role: "super_admin" as const,
        isRealSuperAdmin: true,
        isRealAdmin: true,
        workspaces: [{ id: "t1", name: "Ziki", slug: "ziki" }],
        activeTenantId: "t1",
        ...props,
      }}
    />,
  );
}

describe("account menu role switch", () => {
  it("anchors the account menu beneath an unclipped surface bar", () => {
    renderHeader();
    const header = document.querySelector("header");
    expect(header?.className).toContain("bg-surface");
    expect(header?.className).not.toContain("backdrop-blur");
    const account = screen.getByRole("button", { name: /account menu/i });
    const anchor = account.parentElement;
    expect(anchor?.className).toContain("relative");
    expect(anchor?.className).toContain("shrink-0");
  });

  it("opens the account menu and asks to switch the active role", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByRole("group", { name: /view as/i })).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: /normal user/i }));

    expect(switchRole).toHaveBeenCalledWith("user", `${window.location.pathname}${window.location.search}`);
  });

  it("closes the Agents menu when a destination is chosen", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByRole("button", { name: "Agents" }));
    expect(screen.getByRole("button", { name: "Agents" }).getAttribute("aria-expanded")).toBe("true");
    await user.click(screen.getByRole("link", { name: "Manage agents" }));
    expect(screen.getByRole("button", { name: "Agents" }).getAttribute("aria-expanded")).toBe("false");
  });

  it("renders Escalations as a link, with the pending count (#763)", () => {
    renderHeader({ pendingEscalationsCount: 5 });
    const link = screen.getByRole("link", { name: /escalations/i });
    expect(link.getAttribute("href")).toBe("/escalations");
    expect(screen.getAllByLabelText("5 pending").length).toBeGreaterThan(0);
  });

  it("does not put a Workspace menu in the bar", () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: "Workspace" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Workspace" })).toBeNull();
  });

  it("shows this person's points in the bar", () => {
    renderHeader({ userId: "ada", points: 128, solvedTasks: 4 });
    const link = screen.getByRole("link", { name: /128 pts of 500, 4 solved/i });
    expect(link.getAttribute("href")).toBe("/users/ada");
    expect(link.textContent).toContain("128");
  });

  it("keeps each control's visible text inside its accessible name", () => {
    const { container } = renderHeader({
      userId: "ada",
      points: 0,
      solvedTasks: 0,
      unreadCount: 3,
      pendingEscalationsCount: 5,
    });
    expect(labelInNameMismatches(container)).toEqual([]);
  });

  it("renders Docs & /llms.txt link in the account menu (#625)", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    const docsLink = screen.getByRole("link", { name: /docs & \/llms\.txt/i });
    expect(docsLink).toBeTruthy();
    expect(docsLink.getAttribute("href")).toBe("/docs");
  });
});

describe("theme toggle in header (#659)", () => {
  it("renders the theme toggle button in the header toolbar", () => {
    renderHeader();
    const toggle = screen.getByTestId("theme-toggle");
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-label")).toMatch(/switch to (dark|light) mode/i);
  });

  it("renders the theme options in the account menu", async () => {
    const user = userEvent.setup();
    renderHeader();

    await user.click(screen.getByRole("button", { name: /account menu/i }));

    expect(screen.getByRole("group", { name: /theme preference/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dark" })).toBeTruthy();
  });
});


describe("Profile account navigation (#576)", () => {
  it.each([
    ["/settings/profile", "Profile"],
    ["/settings", "Settings"],
    ["/settings/security", "Settings"],
  ])("marks only %s current in the account menu", async (pathname, currentLabel) => {
    navigation.pathname = pathname;
    const user = userEvent.setup();
    const { container } = renderHeader();

    await user.click(screen.getByRole("button", { name: /account menu/i }));
    const panel = container.querySelector("#account-menu")!;
    const profile = panel.querySelector('a[href="/settings/profile"]')!;
    const settings = panel.querySelector('a[href="/settings"]')!;
    expect(profile.textContent).toBe("Profile");
    expect(settings.textContent).toBe("Settings");
    expect(profile.getAttribute("aria-current")).toBe(currentLabel === "Profile" ? "page" : null);
    expect(settings.getAttribute("aria-current")).toBe(currentLabel === "Settings" ? "page" : null);
  });
});
