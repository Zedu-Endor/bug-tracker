import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The brand palette (#475).
 *
 * app/theme-brand.css re-points the `teal-*` utilities the whole app uses
 * for buttons, accents, highlights and focus rings at a modern brand ramp.
 * This test is the delivery evidence: it reads the CSS that actually ships,
 * in both themes, and asserts that every colour pairing the app renders
 * clears WCAG 2.1 AA — text at 4.5:1, focus and control states at 3:1.
 */

const require = createRequire(import.meta.url);
const repoRoot = path.join(__dirname, "..");

const brandCss = readFileSync(path.join(repoRoot, "app/theme-brand.css"), "utf8");
const darkCss = readFileSync(path.join(repoRoot, "app/theme-dark.css"), "utf8");
const tailwindCss = readFileSync(require.resolve("tailwindcss/theme.css"), "utf8");

type Rgb = [number, number, number];

/** `--color-<family>-<shade>: oklch(L% C H)` -> shade -> oklch string. */
function readScale(css: string, family: string): Record<string, string> {
  const scale: Record<string, string> = {};
  for (const [, shade, value] of css.matchAll(
    new RegExp(`--color-${family}-(\\d+):\\s*([^;]+);`, "g"),
  )) {
    scale[shade] = value.trim();
  }
  return scale;
}

/** Light-mode neutrals and status colours: Tailwind's own palette. */
const tailwindScale = (family: string): Record<string, string> => {
  const scale: Record<string, string> = {};
  for (const [, shade, value] of tailwindCss.matchAll(
    new RegExp(`--color-${family}-(\\d+):\\s*([^;]+);`, "g"),
  )) {
    scale[shade] = value.trim();
  }
  return scale;
};

/** oklch() -> sRGB (gamma encoded), the space browsers composite in. */
function oklchToRgb(value: string): Rgb {
  const match = value.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/);
  if (!match) throw new Error(`Not an oklch() colour: ${value}`);
  const lightness = parseFloat(match[1]) / 100;
  const chroma = parseFloat(match[2]);
  const hue = (parseFloat(match[3]) * Math.PI) / 180;
  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
  return linear.map((channel) => {
    const clipped = Math.max(0, Math.min(1, channel));
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `teal-500/20` -> 20% opacity, the way Tailwind writes it. */
function parseToken(token: string): { name: string; alpha: number } {
  const [name, opacity] = token.split("/");
  return { name, alpha: opacity === undefined ? 1 : parseFloat(opacity) / 100 };
}

type Theme = "light" | "dark";

/** Resolve a colour token's own colour, ignoring any opacity modifier. */
function rawColor(token: string, theme: Theme): Rgb {
  if (token === "white") {
    if (theme === "light") return [1, 1, 1];
    // Dark mode redefines --color-white as the slate-900 raw value, so a
    // card is a dark surface there (see scripts/generate-dark-palette.mjs).
    return oklchToRgb(tailwindScale("slate")["900"]);
  }
  const [family, shade] = token.split("-");
  if (family === "teal") {
    const scale = theme === "light" ? readScale(brandCss, "teal") : readScale(darkCss, "teal");
    return oklchToRgb(scale[shade]);
  }
  const scale = theme === "light" ? tailwindScale(family) : readScale(darkCss, family);
  return oklchToRgb(scale[shade]);
}

/** Paint a translucent colour over a backdrop, the way the browser does it. */
function composite(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return top.map((channel, i) => channel * alpha + bottom[i] * (1 - alpha)) as Rgb;
}

/** Resolve a colour token to sRGB in the given theme. */
function resolve(token: string, theme: Theme, backdrop?: Rgb): Rgb {
  const { name, alpha } = parseToken(token);
  const base = rawColor(name, theme);
  if (alpha >= 1) return base;
  // Alpha composites in sRGB, the way the browser does it.
  return composite(base, alpha, backdrop ?? [0, 0, 0]);
}

/** A surface stack, bottom-up: ["slate-900", "slate-800/60"]. */
function resolveStack(stack: string[], theme: Theme): Rgb {
  let result = resolve(stack[0], theme);
  for (let i = 1; i < stack.length; i++) {
    const { name, alpha } = parseToken(stack[i]);
    result = composite(rawColor(name, theme), alpha, result);
  }
  return result;
}

type Pairing = {
  fg: string;
  bg: string;
  surface: string[];
  /** 4.5 for text, 3 for focus rings and control boundaries. */
  min: number;
  where: string;
};

/**
 * The pairings the app actually renders, harvested from the class names in
 * app/ and components/. Each one names a foreground, the background it is
 * painted on, and the surface stack underneath it.
 */
const PAIRINGS: Pairing[] = [
  { fg: "teal-700", bg: "white", surface: ["white"], min: 4.5, where: "link text on a card" },
  { fg: "teal-700", bg: "slate-50", surface: ["slate-50"], min: 4.5, where: "link text on the page" },
  { fg: "teal-600", bg: "white", surface: ["white"], min: 4.5, where: "bold accent text on a card" },
  { fg: "teal-600", bg: "slate-50", surface: ["slate-50"], min: 4.5, where: "bold accent text on the page" },
  { fg: "teal-800", bg: "white", surface: ["white"], min: 4.5, where: "accent text on a card" },
  { fg: "teal-800", bg: "slate-100", surface: ["slate-100"], min: 4.5, where: "mono chip text" },
  { fg: "teal-900", bg: "white", surface: ["white"], min: 4.5, where: "accent text on a card" },
  { fg: "teal-950", bg: "white", surface: ["white"], min: 4.5, where: "accent text on a card" },
  { fg: "teal-700", bg: "teal-50", surface: ["white"], min: 4.5, where: "chip text on a tint" },
  { fg: "teal-800", bg: "teal-50", surface: ["white"], min: 4.5, where: "chip text on a tint" },
  { fg: "teal-900", bg: "teal-50", surface: ["white"], min: 4.5, where: "chip text on a tint" },
  { fg: "teal-950", bg: "teal-50", surface: ["white"], min: 4.5, where: "badge text on a tint" },
  { fg: "teal-700", bg: "teal-100", surface: ["white"], min: 4.5, where: "tile label on a tint" },
  { fg: "teal-800", bg: "teal-100", surface: ["white"], min: 4.5, where: "avatar text on a tint" },
  { fg: "teal-900", bg: "teal-100", surface: ["white"], min: 4.5, where: "avatar text on a tint" },
  { fg: "teal-950", bg: "teal-100", surface: ["white"], min: 4.5, where: "author badge on a tint" },
  { fg: "teal-900", bg: "teal-50/60", surface: ["white"], min: 4.5, where: "card text on a tint" },
  { fg: "teal-950", bg: "teal-50/60", surface: ["white"], min: 4.5, where: "card title on a tint" },
  { fg: "teal-800", bg: "teal-50/80", surface: ["white"], min: 4.5, where: "pill text on a tint" },
  { fg: "teal-700", bg: "teal-200/60", surface: ["white"], min: 4.5, where: "hovered chip text" },
  { fg: "white", bg: "teal-600", surface: ["white"], min: 4.5, where: "secondary button" },
  { fg: "white", bg: "teal-700", surface: ["white"], min: 4.5, where: "primary button" },
  { fg: "white", bg: "teal-800", surface: ["white"], min: 4.5, where: "primary button hover" },
  { fg: "white", bg: "teal-600", surface: ["white"], min: 4.5, where: "text selection" },
  { fg: "slate-950", bg: "teal-400", surface: ["slate-50"], min: 4.5, where: "homepage hero button" },
  { fg: "slate-950", bg: "teal-300", surface: ["slate-50"], min: 4.5, where: "homepage hero button hover" },
  { fg: "teal-400", bg: "slate-900", surface: ["slate-900"], min: 4.5, where: "homepage section label" },
  { fg: "teal-300", bg: "slate-900", surface: ["slate-900"], min: 4.5, where: "homepage inline code" },
  { fg: "teal-400", bg: "slate-950", surface: ["slate-950"], min: 4.5, where: "homepage code block" },
  {
    fg: "teal-300",
    bg: "teal-500/20",
    surface: ["slate-900", "slate-800/60"],
    min: 4.5,
    where: "homepage step chip and agent badge",
  },
  { fg: "teal-500", bg: "white", surface: ["white"], min: 3, where: "focus ring on an input" },
  { fg: "teal-600", bg: "white", surface: ["white"], min: 3, where: "focus ring on a button" },
  { fg: "teal-600", bg: "slate-50", surface: ["slate-50"], min: 3, where: "focus ring on the page" },
];

describe("brand palette (#475)", () => {
  it("re-points the teal scale at a modern brand ramp", () => {
    const brand = readScale(brandCss, "teal");
    expect(Object.keys(brand)).toHaveLength(11);
    // The ramp is a new palette, not Tailwind's default teal.
    expect(brand["500"]).not.toBe(tailwindScale("teal")["500"]);
    expect(brand["500"]).toMatch(/^oklch\(/);
  });

  it("keeps the brand clear of the colours the app uses for status", () => {
    const brandHue = parseFloat(
      readScale(brandCss, "teal")["500"].match(/oklch\([^)]*?([\d.]+)\s*\)/)![1],
    );
    // emerald = resolved, sky = open, violet = in progress.
    for (const status of ["emerald", "sky", "violet"]) {
      const statusHue = parseFloat(
        tailwindScale(status)["500"].match(/oklch\([^)]*?([\d.]+)\s*\)/)![1],
      );
      const distance = Math.min(
        Math.abs(brandHue - statusHue),
        360 - Math.abs(brandHue - statusHue),
      );
      expect(distance, `brand hue vs ${status}`).toBeGreaterThanOrEqual(25);
    }
  });

  it("mirrors the brand scale into the dark palette", () => {
    const light = readScale(brandCss, "teal");
    const dark = readScale(darkCss, "teal");
    const shades = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
    for (const shade of shades) {
      // Dark mode mirrors the scale end to end: 600 takes the 400 value.
      const mirrored = shades[shades.length - 1 - shades.indexOf(shade)];
      expect(dark[shade], `dark teal-${shade}`).toBe(light[mirrored]);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    it(`clears WCAG AA for every text, focus and control pairing in ${theme} mode`, () => {
      for (const pairing of PAIRINGS) {
        const surface = resolveStack(pairing.surface, theme);
        const background = resolve(pairing.bg, theme, surface);
        const foreground = resolve(pairing.fg, theme, surface);
        const ratio = contrastRatio(foreground, background);
        expect(
          ratio,
          `${theme}: ${pairing.fg} on ${pairing.bg} (${pairing.where})`,
        ).toBeGreaterThanOrEqual(pairing.min);
      }
    });
  }
});
