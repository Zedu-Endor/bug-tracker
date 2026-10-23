// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";

const currentTenantIdFor = vi.hoisted(() => vi.fn());
const requireUser = vi.hoisted(() => vi.fn());
const projectContextFor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenant-context", () => ({ currentTenantIdFor }));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/project-context", () => ({ projectContextFor }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: { findMany: vi.fn() },
    issueClaim: { groupBy: vi.fn() },
    pointEntry: { groupBy: vi.fn() },
    agent: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import TeamPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "viewer-1" });
  currentTenantIdFor.mockResolvedValue("tenant-1");
  projectContextFor.mockResolvedValue({ activeProjectId: "project-1" });
  vi.mocked(prisma.membership.findMany).mockResolvedValue([
    { role: "admin", user: { id: "viewer-1", name: "Ada", email: "ada@example.com", image: null } },
    { role: "member", user: { id: "member-2", name: "Grace", email: "grace@example.com", image: null } },
  ] as never);
  vi.mocked(prisma.issueClaim.groupBy).mockResolvedValue([
    { beneficiaryUserId: "viewer-1", _count: { _all: 1 } },
  ] as never);
  vi.mocked(prisma.pointEntry.groupBy).mockResolvedValue([
    { userId: "viewer-1", _sum: { points: 12 } },
  ] as never);
});

describe("team directory page", () => {
  it("renders workspace members with roles, profile links, points, and capacity", async () => {
    const page = await TeamPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Ada");
    expect(html).toContain("Admin");
    expect(html).toContain("ada@example.com");
    expect(html).toContain('href="/users/viewer-1"');
    expect(html).toContain("12 points in the last 30 days");
    expect(html).toContain("active claims in the selected project");

    expect(html).toContain("Grace");
    expect(html).toContain("Member");
    expect(html).toContain("grace@example.com");
    expect(html).toContain('href="/users/member-2"');

    // Asserts agents are NOT rendered on the member card
    expect(html).not.toContain("No active agents.");
    expect(html).not.toContain("Online now");
    expect(html).not.toContain("Ada's agent");
    expect(prisma.agent.findMany).not.toHaveBeenCalled();

    expect(prisma.membership.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId: "tenant-1" },
    }));
    expect(prisma.issueClaim.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bug: { tenantId: "tenant-1", projectId: "project-1" },
      }),
    }));
  });

  it("passes the accessibility sweep at desktop and 375px widths", async () => {
    const page = await TeamPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);
    const previousWidth = window.innerWidth;
    window.HTMLCanvasElement.prototype.getContext = (() =>
      ({ font: "", measureText: () => ({ width: 0 }) })) as unknown as typeof window.HTMLCanvasElement.prototype.getContext;

    for (const width of [1280, 375]) {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
      document.body.innerHTML = html;
      const { violations } = await axe.run(document.body, {
        rules: {
          "color-contrast": { enabled: false },
          region: { enabled: false },
        },
      });
      expect(violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    }
    Object.defineProperty(window, "innerWidth", { configurable: true, value: previousWidth });
    document.body.innerHTML = "";
  });

  it("filters members by role", async () => {
    const page = await TeamPage({
      searchParams: Promise.resolve({ role: "admin" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Ada");
    expect(html).not.toContain("Grace");
  });

  it("filters members by capacity", async () => {
    vi.mocked(prisma.issueClaim.groupBy).mockResolvedValue([
      { beneficiaryUserId: "viewer-1", _count: { _all: 2 } },
    ] as never);

    const page = await TeamPage({
      searchParams: Promise.resolve({ capacity: "1" }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).not.toContain("Ada");
    expect(html).toContain("Grace");
  });

  it("filters members by capacity when repeated query parameters are provided", async () => {
    vi.mocked(prisma.issueClaim.groupBy).mockResolvedValue([
      { beneficiaryUserId: "viewer-1", _count: { _all: 2 } },
    ] as never);

    const page = await TeamPage({
      searchParams: Promise.resolve({ capacity: ["1", "1"] }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).not.toContain("Ada");
    expect(html).toContain("Grace");
  });

  it("does not query or display tenant data without a workspace", async () => {
    currentTenantIdFor.mockResolvedValue(null);

    const page = await TeamPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("Join or create a workspace");
    expect(prisma.membership.findMany).not.toHaveBeenCalled();
    expect(prisma.issueClaim.groupBy).not.toHaveBeenCalled();
  });
});
