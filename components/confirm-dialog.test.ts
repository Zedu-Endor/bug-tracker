import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The native prompt cannot be styled, is announced inconsistently and blocks
 * the whole tab. Every destructive action now goes through <ConfirmDialog>,
 * and this guard stops `window.confirm` creeping back in with the next one.
 */
const ROOTS = ["components", "app"];

/** The provider itself keeps a native fallback for a tree without a provider. */
const ALLOWED = new Set(["components/ui/confirm-dialog.tsx"]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

describe("confirmation dialogs", () => {
  const files = ROOTS.flatMap((root) => sourceFiles(root));

  it("finds the components it is guarding", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files.filter((f) => !ALLOWED.has(f)))(
    "%s does not call the browser's confirm()",
    (file) => {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\bwindow\.confirm\s*\(/);
      // A bare `confirm(` is only legal when it is the hook's result being
      // called — `const confirm = useConfirm()` — so require that pairing.
      if (/(?<![.\w])confirm\s*\(/.test(source)) {
        expect(source).toMatch(/const confirm = useConfirm\(\)/);
      }
    },
  );

  it("still guards a file that calls it", () => {
    // Proves the matcher above would actually fail, rather than passing
    // because the regex never matches anything.
    expect("window.confirm('x')").toMatch(/\bwindow\.confirm\s*\(/);
  });
});
