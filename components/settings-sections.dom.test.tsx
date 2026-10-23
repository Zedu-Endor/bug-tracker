// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SettingsSections } from "./settings-sections";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

const sections = [
  { id: "account", label: "Account", hint: "Profile, wallet, security", icon: null },
  { id: "preferences", label: "Preferences", hint: "Theme, emails, shortcuts", icon: null },
];

function Example() {
  return (
    <SettingsSections sections={sections}>
      <div data-settings-section="account">Account panel</div>
      <div data-settings-section="preferences">Preferences panel</div>
    </SettingsSections>
  );
}

describe("SettingsSections", () => {
  it("switches panels and marks the current section", () => {
    render(<Example />);

    expect(screen.getByText("Account panel")).toBeVisible();
    expect(screen.getByText("Preferences panel")).not.toBeVisible();
    expect(
      screen.getByRole("button", { name: /Account/ }),
    ).toHaveAttribute("aria-current", "page");

    fireEvent.click(screen.getByRole("button", { name: /Preferences/ }));

    expect(screen.getByText("Account panel")).not.toBeVisible();
    expect(screen.getByText("Preferences panel")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /Preferences/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(window.location.hash).toBe("#preferences");
  });

  it("opens the section named in the URL hash", () => {
    window.location.hash = "#preferences";
    render(<Example />);

    expect(screen.getByText("Preferences panel")).toBeVisible();
    expect(screen.getByText("Account panel")).not.toBeVisible();
  });
});
