import { describe, expect, it } from "vitest";
import { AVATAR_TONES, avatarTone, safeAvatarUrl } from "./avatar";

describe("avatarTone", () => {
  it("is deterministic and ignores case and surrounding spaces", () => {
    expect(avatarTone("Ada Lovelace")).toBe(avatarTone("Ada Lovelace"));
    expect(avatarTone("Ada Lovelace")).toBe(avatarTone("  ada lovelace "));
  });
  it("always returns a known tone, including for empty input", () => {
    for (const name of ["", "   ", null, undefined, "李小龙", "😀", "x".repeat(500)]) {
      expect(AVATAR_TONES).toContain(avatarTone(name));
    }
  });
  it("spreads different people across the palette", () => {
    const names = Array.from({ length: 200 }, (_, i) => `Person ${i}`);
    const used = new Set(names.map(avatarTone));
    expect(used.size).toBeGreaterThanOrEqual(AVATAR_TONES.length - 1);
  });
});

describe("tone contrast", () => {
  // Tailwind's published hex values for the shades used.
  const hex: Record<string, string> = {
    "teal-100": "#cbf6fb", "teal-800": "#005860",
    "sky-100": "#e0f2fe", "sky-800": "#075985",
    "indigo-100": "#e0e7ff", "indigo-800": "#3730a3",
    "violet-100": "#ede9fe", "violet-800": "#5b21b6",
    "fuchsia-100": "#fae8ff", "fuchsia-800": "#86198f",
    "rose-100": "#ffe4e6", "rose-800": "#9f1239",
    "amber-100": "#fef3c7", "amber-900": "#78350f",
    "lime-100": "#ecfccb", "lime-900": "#365314",
  };
  const lum = (h: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) =>
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each(AVATAR_TONES.map((t) => [t]))("%s meets 4.5:1", (tone) => {
    const [bg, fg] = tone.split(" ").map((c) => hex[c.replace(/^(bg|text)-/, "")]);
    expect(bg && fg, tone).toBeTruthy();
    expect(ratio(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("safeAvatarUrl", () => {
  it("accepts https images", () => {
    expect(safeAvatarUrl("https://lh3.googleusercontent.com/a/abc=s96-c")).toBe(
      "https://lh3.googleusercontent.com/a/abc=s96-c",
    );
  });
  it.each([
    "http://example.com/a.png",
    "javascript:alert(1)",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "//example.com/a.png",
    "/relative.png",
    "not a url",
    "",
    null,
    undefined,
  ])("rejects %j", (value) => {
    expect(safeAvatarUrl(value)).toBeNull();
  });
});
