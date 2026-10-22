import { expect, type Page } from "@playwright/test";
import { reportIssue, test } from "./fixtures";

/**
 * #1070: at tablet widths the header's project, key, nav and account menu
 * needed about 940px, so every page scrolled sideways at 768px. No page may
 * be wider than the window at any of these widths.
 */
const WIDTHS = [360, 768, 1024, 1280];

async function expectNoSidewaysScroll(page: Page) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    window.innerWidth,
  ]);
  expect(scrollWidth, `page is ${scrollWidth}px wide in a ${innerWidth}px window`).toBeLessThanOrEqual(innerWidth);
}

test.describe("no sideways scroll", () => {
  test.use({ as: "user" });

  for (const width of WIDTHS) {
    test(`the issue list and an issue page at ${width}px`, async ({ page, uniq }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/issues");
      await expectNoSidewaysScroll(page);

      await reportIssue(page, uniq("Layout target"));
      await expectNoSidewaysScroll(page);

      await page.goto("/escalations");
      await expectNoSidewaysScroll(page);
    });
  }

  test("the menu button replaces the full header below 1024px", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/issues");
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
  });

  // The error-codes table on /docs used overflow-hidden, so on a phone its
  // last column was cut off with no way to reach it. It scrolls on its own now.
  for (const width of [375, 768, 1280]) {
    test(`the API docs error table at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/docs");
      await expectNoSidewaysScroll(page);

      const table = page.getByRole("region", { name: "4. Error Codes & Handling" });
      await expect(table).toBeVisible();
      const scroll = await table.evaluate((el) => ({
        overflowX: getComputedStyle(el).overflowX,
        overflows: el.scrollWidth > el.clientWidth,
      }));
      // Wider than its box only where a person can scroll it.
      if (scroll.overflows) expect(["auto", "scroll"]).toContain(scroll.overflowX);

      // Scrolled to the end, the last column is fully inside the box.
      await table.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
      const box = await table.boundingBox();
      // The last header cell, found by element so the check doesn't lean on its accessible name.
      const last = await table.locator("thead th").last().boundingBox();
      expect(box && last).toBeTruthy();
      expect(last!.x + last!.width).toBeLessThanOrEqual(box!.x + box!.width + 1);
    });
  }
});
