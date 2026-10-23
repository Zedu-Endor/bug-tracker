// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/app/actions/settings", () => ({
  setKeyboardShortcutsAction: vi.fn(),
}));
vi.mock("@/components/keyboard-shortcuts", () => ({
  ShowShortcutsButton: () => null,
}));

import { setKeyboardShortcutsAction } from "@/app/actions/settings";
import { KeyboardShortcutSettings } from "./keyboard-shortcut-settings";

const mockSave = vi.mocked(setKeyboardShortcutsAction);

describe("KeyboardShortcutSettings save feedback (#552)", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a failed save as an alert, not as a success status", async () => {
    mockSave.mockResolvedValueOnce({ error: "Could not update keyboard shortcuts setting" });
    const user = userEvent.setup();
    render(<KeyboardShortcutSettings initialEnabled />);

    await user.click(screen.getByLabelText("Use keyboard shortcuts"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not update keyboard shortcuts setting");
    expect(alert).toHaveClass("text-rose-700");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(screen.getByLabelText("Use keyboard shortcuts")).toBeChecked();
  });

  it("shows success as a status and clears an earlier error", async () => {
    mockSave
      .mockResolvedValueOnce({ error: "Could not update keyboard shortcuts setting" })
      .mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<KeyboardShortcutSettings initialEnabled />);
    const checkbox = screen.getByLabelText("Use keyboard shortcuts");

    await user.click(checkbox);
    await screen.findByRole("alert");
    await user.click(checkbox);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Keyboard shortcuts turned off."));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });
});
