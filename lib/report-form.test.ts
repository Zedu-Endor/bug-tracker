import { describe, expect, it } from "vitest";
import { resolveReportFormUrl } from "./report-form";

const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSc-xyz/viewform";

describe("resolveReportFormUrl", () => {
  it("returns the configured google form url", () => {
    expect(resolveReportFormUrl({ REPORT_FORM_URL: formUrl })).toBe(formUrl);
  });

  it("accepts forms.gle short links and google subdomains", () => {
    expect(
      resolveReportFormUrl({ REPORT_FORM_URL: "https://forms.gle/abc123" }),
    ).toBe("https://forms.gle/abc123");
    expect(
      resolveReportFormUrl({
        REPORT_FORM_URL: "https://docs.googleusercontent.com/forms/view",
      }),
    ).toBeUndefined();
    expect(
      resolveReportFormUrl({ REPORT_FORM_URL: "https://forms.example.co.uk/x" }),
    ).toBeUndefined();
  });

  it("tolerates quoted and padded values from deploy UIs", () => {
    expect(
      resolveReportFormUrl({ REPORT_FORM_URL: ` "${formUrl}" ` }),
    ).toBe(formUrl);
    expect(resolveReportFormUrl({ REPORT_FORM_URL: `''` })).toBeUndefined();
    expect(resolveReportFormUrl({ REPORT_FORM_URL: "   " })).toBeUndefined();
  });

  it("returns undefined when unset", () => {
    expect(resolveReportFormUrl({})).toBeUndefined();
    expect(resolveReportFormUrl({ REPORT_FORM_URL: undefined })).toBeUndefined();
  });

  it("rejects non-https and malformed values", () => {
    expect(
      resolveReportFormUrl({ REPORT_FORM_URL: "http://docs.google.com/x" }),
    ).toBeUndefined();
    expect(
      resolveReportFormUrl({ REPORT_FORM_URL: "javascript:alert(1)" }),
    ).toBeUndefined();
    expect(resolveReportFormUrl({ REPORT_FORM_URL: "not a url" })).toBeUndefined();
  });

  it("rejects lookalike hosts", () => {
    expect(
      resolveReportFormUrl({
        REPORT_FORM_URL: "https://docs.google.com.evil.test/forms/view",
      }),
    ).toBeUndefined();
    expect(
      resolveReportFormUrl({
        REPORT_FORM_URL: "https://evil.test/docs.google.com",
      }),
    ).toBeUndefined();
  });
});