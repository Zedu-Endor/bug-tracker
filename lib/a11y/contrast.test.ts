// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  meetsWcagAA,
  contrastMismatches,
  relativeLuminance,
} from "./contrast";

describe("WCAG 2.1 Color Contrast", () => {
  it("calculates correct relative luminance for black and white", () => {
    expect(relativeLuminance(0, 0, 0)).toBe(0);
    expect(relativeLuminance(255, 255, 255)).toBe(1);
  });

  it("calculates exact black-on-white contrast ratio of 21:1", () => {
    const ratio = contrastRatio("#000000", "#ffffff");
    expect(ratio).toBeCloseTo(21, 1);
  });

  it("calculates identical colors as 1:1", () => {
    expect(contrastRatio("#123456", "#123456")).toBe(1);
    expect(meetsWcagAA(1)).toBe(false);
  });

  describe("Token-level design palette checks (#638)", () => {
    // Semantic tokens from app/globals.css
    const PALETTE_PAIRS = [
      { name: "ok (emerald)", fg: "#146c43", bg: "#e3f6ec", min: 4.5 },
      { name: "bad (red)", fg: "#a3261a", bg: "#fde8e4", min: 4.5 },
      { name: "warn (amber)", fg: "#7a4e00", bg: "#fdf3d7", min: 4.5 },
      { name: "info (blue)", fg: "#1d4fb8", bg: "#e7f0ff", min: 4.5 },
      { name: "text on light canvas", fg: "#15121f", bg: "#f5f7fc", min: 4.5 },
      { name: "text on card surface", fg: "#15121f", bg: "#ffffff", min: 4.5 },
      { name: "text2 on card surface", fg: "#3e4a63", bg: "#ffffff", min: 4.5 },
    ];

    for (const pair of PALETTE_PAIRS) {
      it(`palette token pair ${pair.name} meets ${pair.min}:1 contrast`, () => {
        const ratio = contrastRatio(pair.fg, pair.bg);
        expect(ratio, `contrast ratio for ${pair.name} (${pair.fg} on ${pair.bg})`).toBeGreaterThanOrEqual(
          pair.min,
        );
      });
    }
  });

  describe("DOM contrast scanner", () => {
    it("passes for high-contrast pairs (e.g. text-slate-700 on white)", () => {
      const div = document.createElement("div");
      div.className = "bg-white";
      div.innerHTML = `<p class="text-slate-700">Readable text</p>`;

      const mismatches = contrastMismatches(div);
      expect(mismatches).toEqual([]);
    });

    it("fails on deliberately low-contrast pair fixture (text-slate-300 on white) (#638 criterion 4)", () => {
      const div = document.createElement("div");
      div.className = "bg-white";
      div.innerHTML = `<span class="text-slate-300">Hard to read text</span>`;

      const mismatches = contrastMismatches(div);
      expect(mismatches.length).toBe(1);
      expect(mismatches[0].textColor).toBe("#cbd5e1"); // slate-300
      expect(mismatches[0].backgroundColor).toBe("#ffffff"); // white
      expect(mismatches[0].ratio).toBeLessThan(4.5);
      expect(mismatches[0].message).toContain("below WCAG AA required 4.5:1");
    });

    it("scans inline styles when classes are absent", () => {
      const div = document.createElement("div");
      div.style.backgroundColor = "#ffffff";
      div.innerHTML = `<span style="color: #cbd5e1">Inline styled text</span>`;

      const mismatches = contrastMismatches(div);
      expect(mismatches.length).toBe(1);
      // CSSOM normalizes hex colors to rgb() in el.style
      expect(mismatches[0].textColor).toMatch(/^(#cbd5e1|rgb\(203,\s*213,\s*225\))$/);
      expect(mismatches[0].backgroundColor).toMatch(/^(#ffffff|rgb\(255,\s*255,\s*255\))$/);
      expect(mismatches[0].ratio).toBeLessThan(4.5);
    });

    it("applies 3:1 threshold for large text elements", () => {
      // #3b82f6 (blue-500) on #ffffff has ratio ~ 3.68:1.
      // Below 4.5:1 (fails normal), but above 3.0:1 (passes large text >= 24px).
      const container = document.createElement("div");
      const heading = document.createElement("h1");
      heading.className = "text-2xl text-blue-500 bg-white";
      heading.textContent = "Large Heading Text";
      container.appendChild(heading);

      const mismatches = contrastMismatches(container);
      expect(mismatches).toEqual([]);

      // Verify the same color fails if normal size
      const normalText = document.createElement("p");
      normalText.className = "text-sm text-blue-500 bg-white";
      normalText.textContent = "Small Text";
      container.appendChild(normalText);

      const normalMismatches = contrastMismatches(container);
      expect(normalMismatches.length).toBe(1);
      expect(normalMismatches[0].ratio).toBeLessThan(4.5);
      expect(normalMismatches[0].expectedRatio).toBe(4.5);
    });

    it("skips transparent inline background to resolve ancestor background", () => {
      const container = document.createElement("div");
      container.className = "bg-slate-900";

      const child = document.createElement("div");
      child.style.backgroundColor = "transparent";

      const text = document.createElement("p");
      text.className = "text-white";
      text.textContent = "Visible on dark ancestor";
      child.appendChild(text);
      container.appendChild(child);

      const mismatches = contrastMismatches(container);
      expect(mismatches).toEqual([]);
    });

    it("strictly enforces exact thresholds in meetsWcagAA", () => {
      expect(meetsWcagAA(4.49, false)).toBe(false);
      expect(meetsWcagAA(4.5, false)).toBe(true);
      expect(meetsWcagAA(2.99, true)).toBe(false);
      expect(meetsWcagAA(3.0, true)).toBe(true);
    });
  });
});
