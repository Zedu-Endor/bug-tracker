// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IssueActionsDialog } from "./issue-actions-dialog";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("Prototype issue action menu", () => {
  it("routes triage to the existing agent decisions with no management dialog", () => {
    render(<><button id="issue-tab-decisions">Agent decisions</button><IssueActionsDialog /></>);
    const target = vi.fn(); document.getElementById("issue-tab-decisions")!.addEventListener("click", target);
    const trigger = screen.getByRole("button", { name: "More actions" });
    const menu = document.getElementById(trigger.getAttribute("popovertarget")!)!;
    Object.defineProperty(menu, "hidePopover", { value: vi.fn() });
    expect(Array.from(menu.querySelectorAll("button")).map(button => button.textContent)).toEqual(["View bids ", "Triage & confirmation ", "Review the fix ", "View progress "]);
    fireEvent.click(menu.querySelectorAll("button")[1]);
    expect(target).toHaveBeenCalledOnce();
    expect(document.querySelector("dialog")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
  });
  it("routes bids and reviews into discussion filters and progress into activity", () => {
    render(<><button id="issue-tab-conversation">Discussion</button><button id="issue-tab-activity">Activity</button><div id="conversation"><button data-comment-filter="bid">Bids filter</button><button data-comment-filter="review">Reviews filter</button></div><IssueActionsDialog /></>);
    const trigger = screen.getByRole("button", { name: "More actions" });
    const menu = document.getElementById(trigger.getAttribute("popovertarget")!)!;
    Object.defineProperty(menu, "hidePopover", { value: vi.fn() });
    const discussion = vi.fn(), activity = vi.fn(), bids = vi.fn(), reviews = vi.fn();
    document.getElementById("issue-tab-conversation")!.addEventListener("click", discussion);
    document.getElementById("issue-tab-activity")!.addEventListener("click", activity);
    document.querySelector('[data-comment-filter="bid"]')!.addEventListener("click", bids);
    document.querySelector('[data-comment-filter="review"]')!.addEventListener("click", reviews);
    const buttons = menu.querySelectorAll("button");
    fireEvent.click(buttons[0]); fireEvent.click(buttons[2]); fireEvent.click(buttons[3]);
    expect(discussion).toHaveBeenCalledTimes(2); expect(bids).toHaveBeenCalledOnce(); expect(reviews).toHaveBeenCalledOnce(); expect(activity).toHaveBeenCalledOnce();
  });
});
