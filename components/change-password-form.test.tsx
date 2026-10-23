import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions/settings", () => ({ changePasswordAction: vi.fn() }));

import { ChangePasswordForm } from "./change-password-form";

describe("ChangePasswordForm (#570)", () => {
  it("collects the current password, new password, and confirmation", () => {
    const html = renderToStaticMarkup(createElement(ChangePasswordForm));

    expect(html).toContain('id="currentPassword"');
    expect(html).toContain('id="newPassword"');
    expect(html).toContain('id="confirmPassword"');
    // The server renderer may keep React's `autoComplete` casing; match either.
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html).toMatch(/autocomplete="new-password"/i);
    expect(html).toContain("Change password");
  });

  it("renders two-factor code input when twoFactorEnabled is true (#568)", () => {
    const html = renderToStaticMarkup(<ChangePasswordForm twoFactorEnabled={true} />);
    expect(html).toContain('id="code"');
    expect(html).toContain("Two-factor code");
  });
});
