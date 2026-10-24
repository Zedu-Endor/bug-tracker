// @vitest-environment happy-dom
import "@testing-library/jest-dom/vitest";
import {cleanup, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach, describe, expect, it} from "vitest";
import {IssueSectionTabs} from "./issue-section-tabs";
const props = {description:<p>Issue description</p>, conversation:<p>Existing discussion</p>, decisions:<p>Agent assessment</p>, activity:<p>Audit history</p>, conversationCount:3, decisionsCount:2, activityCount:4};
afterEach(()=>{cleanup();window.history.replaceState({},"","/");});
describe("Issue detail tabs",()=>{
  it("defaults to description and preserves the other server-rendered panels",async()=>{
    const user=userEvent.setup();render(<IssueSectionTabs {...props}/>);
    expect(screen.getByRole("tab",{name:"Description"})).toHaveAttribute("aria-selected","true");
    expect(screen.getByText("Existing discussion")).not.toBeVisible();
    await user.click(screen.getByRole("tab",{name:"Discussion 3"}));
    expect(screen.getByText("Existing discussion")).toBeVisible();
    expect(screen.getByText("Issue description")).not.toBeVisible();
    expect(screen.getByText("Agent assessment")).toBeInTheDocument();
  });
  it("supports roving keyboard focus across all four sections",async()=>{
    const user=userEvent.setup();render(<IssueSectionTabs {...props}/>);
    const description=screen.getByRole("tab",{name:"Description"});description.focus();
    await user.keyboard("{ArrowRight}");expect(screen.getByRole("tab",{name:"Discussion 3"})).toHaveFocus();
    await user.keyboard("{End}");expect(screen.getByRole("tab",{name:"Activity 4"})).toHaveFocus();
    expect(screen.getByText("Audit history")).toBeVisible();
    await user.keyboard("{Home}");expect(description).toHaveFocus();
  });
  it("reveals a directly linked comment without requiring a tab click",async()=>{
    window.history.replaceState({},"","/?comment=abc#comment-abc");
    render(<IssueSectionTabs {...props}/>);
    await waitFor(()=>expect(screen.getByRole("tab",{name:"Discussion 3"})).toHaveAttribute("aria-selected","true"));
  });
  it("prioritizes explicit section links over a persisted comment query",async()=>{
    window.history.replaceState({},"","/?comment=abc#comment-abc");
    render(<IssueSectionTabs {...props}/>);
    window.history.replaceState({},"","/?comment=abc#decisions");window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(()=>expect(screen.getByText("Agent assessment")).toBeVisible());
    window.history.replaceState({},"","/?comment=abc#issue-evidence");window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(()=>expect(screen.getByText("Issue description")).toBeVisible());
  });
});
