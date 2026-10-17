import { describe, expect, it } from "vitest";
import { isGitHubUrl, isHttpUrl, splitProofLinkLines } from "./proof-links";

describe("splitProofLinkLines", () => {
  it("returns empty array for blank input", () => {
    expect(splitProofLinkLines("")).toEqual([]);
    expect(splitProofLinkLines("   \n  ")).toEqual([]);
    expect(splitProofLinkLines(undefined)).toEqual([]);
  });

  it("splits and trims newline-separated URLs", () => {
    expect(
      splitProofLinkLines(
        " https://github.com/org/repo/issues/1 \n\nhttps://github.com/org/repo/pull/2\n",
      ),
    ).toEqual([
      "https://github.com/org/repo/issues/1",
      "https://github.com/org/repo/pull/2",
    ]);
  });
});

describe("isHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(isHttpUrl("https://cdn.example.com/shot.png")).toBe(true);
    expect(isHttpUrl("http://localhost:3000/clip.webm")).toBe(true);
  });

  it("rejects non-http schemes and invalid strings", () => {
    expect(isHttpUrl("ftp://files.example.com/a")).toBe(false);
    expect(isHttpUrl("not-a-url")).toBe(false);
  });
});

describe("isGitHubUrl", () => {
  it("accepts valid GitHub issue, pull request, repo, and gist URLs", () => {
    expect(isGitHubUrl("https://github.com/Zedu-Endor/bug-tracker/issues/99")).toBe(true);
    expect(isGitHubUrl("https://github.com/zeduchat/bug-tracker/pull/12")).toBe(true);
    expect(isGitHubUrl("https://github.com/facebook/react")).toBe(true);
    expect(isGitHubUrl("https://www.github.com/org/repo/issues/1")).toBe(true);
    expect(isGitHubUrl("https://gist.github.com/user/123456")).toBe(true);
    expect(isGitHubUrl("http://github.com/org/repo/issues/1")).toBe(true);
  });

  it("rejects non-GitHub URLs", () => {
    expect(isGitHubUrl("https://cdn.example.com/shot.png")).toBe(false);
    expect(isGitHubUrl("https://gitlab.com/org/repo/issues/1")).toBe(false);
    expect(isGitHubUrl("https://bitbucket.org/org/repo")).toBe(false);
    expect(isGitHubUrl("https://google.com")).toBe(false);
    expect(isGitHubUrl("https://fakegithub.com/org/repo")).toBe(false);
  });

  it("rejects GitHub URLs without a path", () => {
    expect(isGitHubUrl("https://github.com")).toBe(false);
    expect(isGitHubUrl("https://github.com/")).toBe(false);
    expect(isGitHubUrl("https://www.github.com")).toBe(false);
  });

  it("rejects invalid URLs and non-http schemes", () => {
    expect(isGitHubUrl("ftp://github.com/org/repo/issues/1")).toBe(false);
    expect(isGitHubUrl("not-a-url")).toBe(false);
    expect(isGitHubUrl("")).toBe(false);
    expect(isGitHubUrl("https://github.com/org/repo/pull/12]")).toBe(false);
  });
});

