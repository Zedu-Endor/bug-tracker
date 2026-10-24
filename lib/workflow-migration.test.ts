import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROJECT_WORKFLOW, WORKFLOW_LIMITS } from "./workflow-config";

/**
 * #632: the #595 backfill carried legacy delivery windows into
 * `ProjectWorkflow.deliveryMinutes` unclamped, so a row above
 * `WORKFLOW_LIMITS.deliveryMinutes.max` could never be saved again — the
 * settings action re-validates every dial on save.
 *
 * The original migration is already applied to real databases, so the repair
 * has to be a forward migration. These checks keep it in step with
 * `lib/workflow-config.ts`.
 */

const migration = readFileSync(
  "prisma/migrations/20261104120000_clamp_project_workflow_delivery_minutes/migration.sql",
  "utf8",
);
const original = readFileSync(
  "prisma/migrations/20261027120000_project_workflow/migration.sql",
  "utf8",
);
const schema = readFileSync("prisma/schema.prisma", "utf8");

const { min, max } = WORKFLOW_LIMITS.deliveryMinutes;
const fallback = DEFAULT_PROJECT_WORKFLOW.deliveryMinutes;

describe("delivery minutes repair migration (#632)", () => {
  it("clamps a legacy value above the cap to the configured maximum", () => {
    expect(migration).toMatch(
      new RegExp(`WHEN\\s+"deliveryMinutes"\\s*>\\s*${max}\\s+THEN\\s+${max}\\b`, "i"),
    );
  });

  it("restores the default for zero and negative legacy values", () => {
    expect(migration).toMatch(
      new RegExp(`WHEN\\s+"deliveryMinutes"\\s*<\\s*${min}\\s+THEN\\s+${fallback}\\b`, "i"),
    );
  });

  it("leaves in-range rows alone", () => {
    // The UPDATE is gated, so a healthy row keeps its existing deadline.
    expect(migration).toMatch(new RegExp(`WHERE[\\s\\S]*"deliveryMinutes"\\s*>\\s*${max}`, "i"));
    expect(migration).toMatch(new RegExp(`WHERE[\\s\\S]*"deliveryMinutes"\\s*<\\s*${min}`, "i"));
    expect(migration).toMatch(/ELSE\s+"deliveryMinutes"/i);
  });

  it("narrows the CHECK constraint to the range the schema accepts", () => {
    expect(migration).toContain('DROP CONSTRAINT "ProjectWorkflow_deliveryMinutes_check"');
    expect(migration).toMatch(
      new RegExp(`CHECK\\s*\\(\\s*"deliveryMinutes"\\s+BETWEEN\\s+${min}\\s+AND\\s+${max}\\s*\\)`, "i"),
    );
  });

  it("repairs rows instead of rewriting the migration that already ran", () => {
    // 20261027120000 is applied on deployed databases; editing it would be a
    // no-op for the rows it already wrote.
    expect(original).toContain('CHECK ("deliveryMinutes" > 0)');
    expect(migration).not.toContain("CREATE TABLE");
    expect(migration).toMatch(/^UPDATE "ProjectWorkflow"/m);
  });

  it("covers every value the backfill can produce", () => {
    // #595 already sent NULL and non-positive legacy windows to the default
    // (NULL > 0 is unknown, so the CASE falls through to ELSE 15), and
    // deliveryMinutes is NOT NULL, so the repair only has two cases to handle.
    expect(original).toContain(
      'CASE WHEN p."deliveryWindowMinutes" > 0 THEN p."deliveryWindowMinutes" ELSE 15 END',
    );
    expect(schema).toMatch(/deliveryMinutes\s+Int\s+@default\(15\)/);
    expect(schema).not.toMatch(/deliveryMinutes\s+Int\?/);
  });

  it("keeps the migration free of destructive operations", () => {
    const statements = migration
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(statements).not.toMatch(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i);
    expect(statements).not.toMatch(/\bTRUNCATE\b/i);
    expect(statements).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
