import { describe, expect, it } from "vitest";
import {
  severityClass,
  statusClass,
  authorBadgeClass,
  categoryBadgeClass,
} from "./labels";
import {
  getIssueTypeBadgeClass,
  issueTypeBadgeClass,
} from "./issue-type-styles";

// Official Tailwind CSS v3 default palette colors (sRGB hex)
const TAILWIND_COLORS: Record<string, string> = {
  // Slate
  "slate-100": "#f1f5f9",
  "slate-700": "#334155",
  "slate-800": "#1e293b",
  "slate-900": "#0f172a",
  // Zinc
  "zinc-100": "#f4f4f5",
  "zinc-800": "#27272a",
  // Red
  "red-100": "#fee2e2",
  "red-900": "#7f1d1d",
  "red-950": "#450a0a",
  // Orange
  "orange-50": "#fff7ed",
  "orange-100": "#ffedd5",
  "orange-900": "#7c2d12",
  "orange-950": "#431407",
  // Amber
  "amber-50": "#fffbeb",
  "amber-100": "#fef3c7",
  "amber-950": "#451a03",
  // Emerald
  "emerald-100": "#d1fae5",
  "emerald-950": "#022c22",
  // Teal
  "teal-50": "#f0fdfa",
  "teal-100": "#ccfbf1",
  "teal-950": "#042f2e",
  // Sky
  "sky-100": "#e0f2fe",
  "sky-950": "#082f49",
  // Indigo
  "indigo-100": "#e0e7ff",
  "indigo-950": "#1e1b4b",
  // Violet
  "violet-100": "#ede9fe",
  "violet-950": "#2e1065",
  // Purple
  "purple-100": "#f3e8ff",
  "purple-950": "#3b0764",
  // Pink
  "pink-100": "#fce7f3",
  "pink-950": "#500724",
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

/**
 * Calculates sRGB relative luminance per WCAG 2.1 specifications.
 * https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getRelativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((val) => {
    const s = val / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates contrast ratio per WCAG 2.1 (minimum 4.5:1 for regular text).
 * https://www.w3.org/TR/WCAG21/#contrast-minimum
 */
function getContrastRatio(hexBg: string, hexText: string): number {
  const l1 = getRelativeLuminance(hexToRgb(hexBg));
  const l2 = getRelativeLuminance(hexToRgb(hexText));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseBgAndTextColor(className: string): { bg: string; text: string } {
  const tokens = className.split(/\s+/);
  const bgToken = tokens.find((t) => t.startsWith("bg-"))?.replace("bg-", "");
  const textToken = tokens.find((t) => t.startsWith("text-"))?.replace("text-", "");

  if (!bgToken || !textToken) {
    throw new Error(`Cannot parse bg or text from "${className}"`);
  }

  const bgHex = TAILWIND_COLORS[bgToken];
  const textHex = TAILWIND_COLORS[textToken];

  if (!bgHex) {
    throw new Error(`Unknown background token: ${bgToken}`);
  }
  if (!textHex) {
    throw new Error(`Unknown text token: ${textToken}`);
  }

  return { bg: bgHex, text: textHex };
}

describe("Badge WCAG 2.1 AA 4.5:1 Contrast Ratio Verification (#366)", () => {
  const WCAG_AA_MINIMUM = 4.5;

  describe("Severity badge contrast", () => {
    for (const [severity, cls] of Object.entries(severityClass)) {
      it(`severity "${severity}" (${cls}) achieves at least 4.5:1 contrast`, () => {
        const { bg, text } = parseBgAndTextColor(cls);
        const ratio = getContrastRatio(bg, text);
        expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MINIMUM);
      });
    }
  });

  describe("Status badge contrast", () => {
    for (const [status, cls] of Object.entries(statusClass)) {
      it(`status "${status}" (${cls}) achieves at least 4.5:1 contrast`, () => {
        const { bg, text } = parseBgAndTextColor(cls);
        const ratio = getContrastRatio(bg, text);
        expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MINIMUM);
      });
    }
  });

  describe("Author and Category badge contrast", () => {
    it(`authorBadgeClass (${authorBadgeClass}) achieves at least 4.5:1 contrast`, () => {
      const { bg, text } = parseBgAndTextColor(authorBadgeClass);
      const ratio = getContrastRatio(bg, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MINIMUM);
    });

    it(`categoryBadgeClass (${categoryBadgeClass}) achieves at least 4.5:1 contrast`, () => {
      const { bg, text } = parseBgAndTextColor(categoryBadgeClass);
      const ratio = getContrastRatio(bg, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MINIMUM);
    });
  });

  describe("Issue type badge contrast", () => {
    for (const [type, cls] of Object.entries(issueTypeBadgeClass)) {
      it(`issue type "${type}" (${cls}) achieves at least 4.5:1 contrast`, () => {
        const { bg, text } = parseBgAndTextColor(cls);
        const ratio = getContrastRatio(bg, text);
        expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MINIMUM);
      });
    }

    it("fallback issue type badge achieves at least 4.5:1 contrast", () => {
      const fallbackCls = getIssueTypeBadgeClass("NonExistentType");
      const { bg, text } = parseBgAndTextColor(fallbackCls);
      const ratio = getContrastRatio(bg, text);
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MINIMUM);
    });
  });
});
