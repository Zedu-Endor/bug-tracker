// @vitest-environment jsdom
"use client";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const setAgentBurstAction = vi.hoisted(() => vi.fn());
const otherAction = vi.hoisted(() => vi.fn());

vi.mock("./actions", () => ({
  regenerateAgentKeyAction: otherAction,
  revokeAgentAction: otherAction,
  deleteAgentAction: otherAction,
  setAgentAreaPreferencesAction: otherAction,
  setAgentBurstAction,
  setAgentLevelAction: otherAction,
  createAgentAction: otherAction,
}));

import { AgentControls } from "./agent-controls";
import { CreateAgentForm } from "./create-agent-form";
import { settableLevels } from "@/lib/agents/levels";

function renderControls(overrides: Partial<ComponentProps<typeof AgentControls>> = {}) {
  return render(
    <AgentControls
      agentId="agent-1"
      agentName="Ada's Claude"
      level="observer"
      levels={["observer"]}
      projects={[]}
      now={new Date()}
      {...overrides}
    />,
  );
}

describe("AgentControls high-volume budget (#596)", () => {
  beforeEach(() => {
    setAgentBurstAction.mockReset();
    setAgentBurstAction.mockResolvedValue({ ok: true });
    otherAction.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it.each([false, true])("offers admin-only creation roles only when admin=%s", (isTenantAdmin) => {
    render(<CreateAgentForm projects={[{ id: "project", name: "Ziki" }]} levels={settableLevels({ isOwner: true, isTenantAdmin })} />);
    expect(Boolean(screen.queryByRole("option", { name: "Dispatcher" }))).toBe(isTenantAdmin);
    expect(Boolean(screen.queryByRole("option", { name: "Merger" }))).toBe(isTenantAdmin);
    expect(screen.getByRole("option", { name: "Reviewer" })).toBeTruthy();
  });

  it("labels the level and new-key project controls visibly (#404)", () => {
    renderControls({
      projects: [{ id: "project-1", name: "Ziki" }],
      currentProjectId: "project-1",
    });

    const level = screen.getByLabelText("Level") as HTMLSelectElement;
    const project = screen.getByLabelText("Project for the new key") as HTMLSelectElement;
    expect(project.value).toBe("project-1");

    for (const [text, control] of [
      [screen.getByText("Level"), level],
      [screen.getByText("Project for the new key"), project],
    ] as const) {
      const label = text.closest("label");
      expect(label).not.toBeNull();
      expect(label?.htmlFor).toBe(control.id);
      expect(label?.className ?? "").not.toContain("sr-only");
      expect(text.className).not.toContain("sr-only");
    }
  });

  it("lets an admin enable high-volume with an optional expiry", async () => {
    renderControls({ canSetBurst: true });

    expect(screen.getByText("Standard budget: 30 writes an hour.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "High-volume" }));

    await waitFor(() => expect(setAgentBurstAction).toHaveBeenCalledWith("agent-1", true, null));
    expect(await screen.findByText("High-volume active with no expiry (400 writes an hour).")).toBeTruthy();
  });

  it("sends the chosen expiry and shows when the grant ends", async () => {
    renderControls({ canSetBurst: true, burst: true });

    fireEvent.change(screen.getByLabelText("High-volume expiry for Ada's Claude"), {
      target: { value: "2h" },
    });

    await waitFor(() => expect(setAgentBurstAction).toHaveBeenCalled());
    const [, enabled, until] = setAgentBurstAction.mock.calls[0];
    expect(enabled).toBe(true);
    expect(typeof until).toBe("string");
    expect(new Date(until as string).getTime()).toBeGreaterThan(Date.now());
    expect(await screen.findByText(/High-volume until/)).toBeTruthy();
  });

  it("shows an expired grant as back on the standard budget", () => {
    renderControls({
      canSetBurst: true,
      burst: true,
      burstUntil: "2020-01-01T00:00:00.000Z",
    });

    expect(screen.getByText("High-volume expired; standard budget: 30 writes an hour.")).toBeTruthy();
  });

  it("does not offer the control to a non-admin", () => {
    renderControls({ burst: true });

    expect(screen.queryByRole("checkbox", { name: "High-volume" })).toBeNull();
    expect(screen.getByText("High-volume active with no expiry (400 writes an hour).")).toBeTruthy();
  });

  it("disables the grant and clears its expiry", async () => {
    renderControls({
      canSetBurst: true,
      burst: true,
      burstUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    fireEvent.click(screen.getByRole("checkbox", { name: "High-volume" }));

    await waitFor(() => expect(setAgentBurstAction).toHaveBeenCalledWith("agent-1", false, null));
    expect(await screen.findByText("Standard budget: 30 writes an hour.")).toBeTruthy();
  });
});
