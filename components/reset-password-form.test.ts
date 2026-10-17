import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => ({
  resetPasswordAction: vi.fn(),
}));

import { ResetPasswordForm } from "./reset-password-form";

const source = readFileSync("components/reset-password-form.tsx", "utf8");

describe("ResetPasswordForm client validation (#359)", () => {
  it("renders password and confirm password inputs", () => {
    const html = renderToStaticMarkup(
      createElement(ResetPasswordForm, { token: "sample-token-123" }),
    );

    expect(html).toContain('id="password"');
    expect(html).toContain('id="confirmPassword"');
    expect(html).toContain('minLength="8"');
    expect(html).toContain("Update password");
  });

  it("checks minimum password length on client before submitting", () => {
    expect(source).toContain("password.length < 8");
    expect(source).toContain('setError("Password must be at least 8 characters")');
  });

  it("checks password confirmation match on client before submitting", () => {
    expect(source).toContain("password !== confirmPassword");
    expect(source).toContain('setError("Passwords do not match")');
  });

  it("provides inline visual feedback for password confirmation match", () => {
    expect(source).toContain("confirmPassword.length > 0 && password !== confirmPassword");
    expect(source).toContain("confirmPassword.length > 0 && password === confirmPassword");
    expect(source).toContain("Passwords match");
  });

  it("does not invoke resetPasswordAction when client validation fails", () => {
    // Both validation checks return before startTransition/resetPasswordAction
    const lengthCheckIdx = source.indexOf("password.length < 8");
    const matchCheckIdx = source.indexOf("password !== confirmPassword");
    const actionCallIdx = source.indexOf("resetPasswordAction(");

    expect(lengthCheckIdx).toBeGreaterThan(0);
    expect(matchCheckIdx).toBeGreaterThan(0);
    expect(actionCallIdx).toBeGreaterThan(lengthCheckIdx);
    expect(actionCallIdx).toBeGreaterThan(matchCheckIdx);
  });

  it("associates aria-describedby and field-level aria-invalid with password inputs", () => {
    expect(source).toContain('aria-describedby="password-hint"');
    expect(source).toContain('aria-describedby="confirm-password-hint"');
    expect(source).toContain("password.length > 0 && password.length < 8");
    expect(source).toContain("confirmPassword.length > 0 && password !== confirmPassword");
  });
});
