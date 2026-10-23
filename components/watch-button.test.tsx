// @vitest-environment jsdom
"use client";

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WatchButton } from "./watch-button";

const setWatchingAction = vi.fn();
const toast = vi.fn();

vi.mock("@/app/actions/watch", () => ({
  setWatchingAction: (...args: unknown[]) => setWatchingAction(...args),
}));

vi.mock("@/components/ui/toast", () => ({
  useToast: () => toast,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  setWatchingAction.mockReset();
  toast.mockReset();
});

describe("WatchButton error handling (#554)", () => {
  it("shows an error toast and rolls back when setWatchingAction fails", async () => {
    const user = userEvent.setup();
    setWatchingAction.mockResolvedValue({ error: "Issue not found" });

    render(<WatchButton bugId="b1" watching={false} />);

    const button = screen.getByRole("button", { name: /watch/i });
    await user.click(button);

    await waitFor(() => expect(setWatchingAction).toHaveBeenCalledWith("b1", true));
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Issue not found", "error"));
    expect(button).toHaveAttribute("aria-pressed", "false");
  });
});
