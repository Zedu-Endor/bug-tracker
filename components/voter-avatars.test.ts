import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VoterAvatars } from "./voter-avatars";
import nextConfig from "../next.config";

describe("VoterAvatars Next.js Image integration (#364)", () => {
  it("defines remotePatterns for Google and GitHub avatars in next.config.ts", () => {
    const remotePatterns = nextConfig.images?.remotePatterns ?? [];
    const hostnames = remotePatterns.map((p) => (typeof p === "object" ? p.hostname : ""));
    expect(hostnames).toContain("lh3.googleusercontent.com");
    expect(hostnames).toContain("avatars.githubusercontent.com");
  });

  it("renders null when totalCount is 0 or voters array is empty", () => {
    const html1 = renderToStaticMarkup(
      createElement(VoterAvatars, { voters: [], totalCount: 0 }),
    );
    expect(html1).toBe("");

    const html2 = renderToStaticMarkup(
      createElement(VoterAvatars, {
        voters: [],
        totalCount: 5,
      }),
    );
    expect(html2).toBe("");
  });

  it("renders Next.js Image with proper dimensions and alt text for voters with avatars", () => {
    const html = renderToStaticMarkup(
      createElement(VoterAvatars, {
        voters: [
          {
            id: "user-1",
            name: "Ada Lovelace",
            image: "https://avatars.githubusercontent.com/u/123",
          },
        ],
        totalCount: 1,
        size: "sm",
      }),
    );

    expect(html).toContain('alt="Ada Lovelace"');
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
  });

  it("renders size md with 28px dimensions", () => {
    const html = renderToStaticMarkup(
      createElement(VoterAvatars, {
        voters: [
          {
            id: "user-2",
            name: "Alan Turing",
            image: "https://lh3.googleusercontent.com/a/456",
          },
        ],
        totalCount: 1,
        size: "md",
      }),
    );

    expect(html).toContain('alt="Alan Turing"');
    expect(html).toContain('width="28"');
    expect(html).toContain('height="28"');
  });

  it("renders initials fallback when image is missing", () => {
    const html = renderToStaticMarkup(
      createElement(VoterAvatars, {
        voters: [
          {
            id: "user-3",
            name: "Grace Hopper",
            image: null,
          },
        ],
        totalCount: 1,
      }),
    );

    expect(html).toContain("<span>GH</span>");
  });

  it("renders overflow indicator when total count exceeds 3", () => {
    const html = renderToStaticMarkup(
      createElement(VoterAvatars, {
        voters: [
          { id: "1", name: "User 1", image: null },
          { id: "2", name: "User 2", image: null },
          { id: "3", name: "User 3", image: null },
        ],
        totalCount: 10,
      }),
    );

    expect(html).toContain("+7");
  });
});
