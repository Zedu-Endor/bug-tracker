import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * WCAG 2.x A/AA only. The `best-practice` tag is opinionated rather than a
 * conformance level, so it stays out of a gate that can fail the build.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

type ScanOptions = {
  /** Restrict the scan, e.g. to one dialog the spec just opened. */
  include?: string;
  /** Selectors to skip, for third-party or decorative regions. */
  exclude?: string[];
};

/**
 * Axe measures contrast on the colours as painted, so a card that is still
 * fading in can report its links below AA while they are translucent (the
 * login card fades up over 600ms). Wait for finite animations to settle
 * first; infinite decorative loops (the auth frame's floating cards) never
 * finish and are skipped.
 */
async function waitForAnimations(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => {
      const iterations = animation.effect?.getTiming().iterations;
      return iterations === Infinity || animation.playState !== "running";
    }),
  );
}

/**
 * Scans the page axe and fails with a readable list of what broke.
 *
 * Unlike the jsdom unit tests (components/a11y.test.tsx), this runs in a real
 * browser, so `color-contrast` is evaluated for real instead of being skipped.
 */
export async function expectNoA11yViolations(
  page: Page,
  options: ScanOptions = {},
) {
  await waitForAnimations(page);
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (options.include) builder = builder.include(options.include);
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector);
  }

  const { violations } = await builder.analyze();
  const report = violations.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.help}\n    ${violation.nodes
        .map((node) => `${node.target.join(" ")}\n      ${node.html}`)
        .join("\n    ")}`,
  );

  expect(report, `axe violations on ${page.url()}`).toEqual([]);
}
