import { test, expect, reportIssue } from "./fixtures";

test.use({ as: "admin" });

test("deletes an issue, finds it among deleted ones, and restores it", async ({ page, uniq }) => {
  const title = uniq("Delete and restore check");
  const url = await reportIssue(page, title);

  await page.getByRole("button", { name: "Delete issue" }).first().click();
  const confirm = page.getByRole("dialog");
  await expect(confirm).toContainText(title);
  await confirm.getByRole("button", { name: "Delete issue" }).click();
  await expect(page.getByText(/This issue was deleted|deleted/i).first()).toBeVisible();

  await page.goto(`/issues?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  await page.goto(`/issues?deleted=true&q=${encodeURIComponent(title)}`);
  // On mobile the sticky header can cover the first row when Playwright scrolls
  // it to the top, so centre the deleted issue link before clicking it.
  await page.evaluate(() => {
    const el = document.querySelector('a[data-issue-link]');
    if (el) el.scrollIntoView({ block: "center" });
  });
  await page.getByRole("link", { name: new RegExp(title) }).first().click({ force: true });
  await expect(page).toHaveURL(url);
  await page.getByRole("button", { name: /^Restore/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Restore issue" }).click();
  await expect(page.getByText("This issue was deleted")).toHaveCount(0);

  await page.goto(`/issues?q=${encodeURIComponent(title)}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
});

test.describe("as a normal user", () => {
  test.use({ as: "user" });
  test("there is no delete control", async ({ page, uniq }) => {
    await reportIssue(page, uniq("No delete for users"));
    await expect(page.getByRole("button", { name: "Delete issue" })).toHaveCount(0);
  });
});
