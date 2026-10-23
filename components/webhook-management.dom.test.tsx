// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  reEnable: vi.fn(),
}));
vi.mock("@/app/actions/webhooks", () => ({
  createWebhookAction: actions.create,
  deleteWebhookAction: actions.remove,
  listWebhooksAction: actions.list,
  reEnableWebhookAction: actions.reEnable,
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => vi.fn() }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("@/lib/clipboard", () => ({ copyText: vi.fn(async () => true) }));

import { WebhookManagement } from "./webhook-management";

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

const agent = { id: "agent-1", name: "Review Bot", level: "reviewer" as const };

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    url: "https://example.com/hooks/ziki",
    enabled: true,
    failureCount: 0,
    disabledAt: null,
    createdAt: new Date("2026-10-20T10:00:00Z"),
    lastError: null,
    lastErrorAt: null,
    lastDeliveredAt: null,
    agent: { id: agent.id, name: agent.name },
    ...overrides,
  };
}

describe("WebhookManagement", () => {
  it("shows a retryable error when the initial list action rejects", async () => {
    const user = userEvent.setup();
    actions.list
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce({ ok: true, subscriptions: [], agents: [] });
    render(<WebhookManagement />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load webhook subscriptions");
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Add webhook" })).toBeInTheDocument();
    expect(actions.list).toHaveBeenCalledTimes(2);
  });

  it("renders real subscriptions with their delivery state", async () => {
    actions.list.mockResolvedValue({
      ok: true,
      agents: [agent],
      subscriptions: [
        subscription(),
        subscription({
          id: "sub-2",
          enabled: false,
          failureCount: 2,
          lastError: "Receiver returned 500",
        }),
      ],
    });
    render(<WebhookManagement />);

    expect(await screen.findAllByText("Review Bot")).toHaveLength(3);
    const subscriptions = screen.getByRole("region", { name: "Subscriptions" });
    expect(within(subscriptions).getAllByText("Review Bot")).toHaveLength(2);
    expect(within(subscriptions).getAllByText("https://example.com/hooks/ziki")).toHaveLength(2);
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Disabled")).toBeInTheDocument();
    expect(screen.getByText(/2 failed deliveries/)).toHaveTextContent("Receiver returned 500");
    expect(screen.getByRole("button", { name: "Re-enable" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Delete webhook/ })).toHaveLength(2);
    expect(screen.getByText("1 active · 2 total")).toBeInTheDocument();
  });

  it("keeps Add webhook disabled until an agent and an HTTPS URL are chosen", async () => {
    const user = userEvent.setup();
    actions.list.mockResolvedValue({ ok: true, agents: [agent], subscriptions: [] });
    render(<WebhookManagement />);

    const add = await screen.findByRole("button", { name: "Add webhook" });
    expect(add).toBeDisabled();
    expect(screen.getByText("No webhook subscriptions yet")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Review Bot/ }));
    expect(add).toBeDisabled();

    const url = screen.getByLabelText("HTTPS endpoint URL");
    await user.type(url, "http://example.com/hooks");
    expect(add).toBeDisabled();
    expect(screen.getByText(/Use an https:\/\/ address/)).toBeInTheDocument();

    await user.clear(url);
    await user.type(url, "https://example.com/hooks");
    expect(add).toBeEnabled();
    expect(screen.getByText("Looks good.")).toBeInTheDocument();
  });
});
