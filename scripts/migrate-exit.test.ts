import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Runs scripts/migrate.mjs against a stand-in `prisma` binary, so the exit
 * code can be checked without a database (#580).
 */
const dirs: string[] = [];

function run(prismaExitCode: number, env: Record<string, string | undefined>) {
  const dir = mkdtempSync(join(tmpdir(), "migrate-exit-"));
  dirs.push(dir);
  mkdirSync(join(dir, "scripts"));
  cpSync("scripts/migrate.mjs", join(dir, "scripts/migrate.mjs"));
  cpSync("scripts/migration-database-url.mjs", join(dir, "scripts/migration-database-url.mjs"));
  mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
  const callsPath = join(dir, "calls.log");
  if (process.platform === "win32") {
    writeWindowsPrismaStub(dir, [
      'const fs = require("node:fs");',
      'fs.appendFileSync(process.env.MIGRATE_TEST_CALLS, "url=" + process.env.DATABASE_URL + "\\nprisma " + process.argv.slice(2).join(" ") + "\\n");',
      `process.exit(${prismaExitCode});`,
    ].join("\n"));
  } else {
    const prisma = join(dir, "node_modules/.bin/prisma");
    writeFileSync(prisma, `#!/bin/sh\necho "url=$DATABASE_URL" >> "${callsPath}"\necho "prisma $*" >> "${callsPath}"\nexit ${prismaExitCode}\n`);
    chmodSync(prisma, 0o755);
  }
  const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    cwd: dir,
    // Only what the script needs, so the parent's NODE_ENV and DATABASE_URL don't leak in.
    env: { PATH: process.env.PATH, MIGRATE_TEST_CALLS: callsPath, ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  const calls = (() => {
    try {
      return readFileSync(callsPath, "utf8");
    } catch {
      return "";
    }
  })();
  return { status: result.status, output: `${result.stdout}${result.stderr}`, calls };
}

function runStub(script: string, env: Record<string, string | undefined>) {
  const dir = mkdtempSync(join(tmpdir(), "migrate-exit-"));
  dirs.push(dir);
  mkdirSync(join(dir, "scripts"));
  cpSync("scripts/migrate.mjs", join(dir, "scripts/migrate.mjs"));
  cpSync("scripts/migration-database-url.mjs", join(dir, "scripts/migration-database-url.mjs"));
  mkdirSync(join(dir, "node_modules/.bin"), { recursive: true });
  const calls = join(dir, "calls.log");
  if (process.platform === "win32") {
    const mode = script.includes("missing User") ? "missing" : script.includes("voteCount") ? "duplicate" : "init-success";
    const js = [
      'const fs = require("node:fs");',
      'const calls = process.env.MIGRATE_TEST_CALLS;',
      'const args = process.argv.slice(2).join(" ");',
      'fs.appendFileSync(calls, "prisma " + args + "\\n");',
      'if (args.includes("db execute")) { if (process.env.MIGRATE_TEST_MODE === "missing") { console.error("missing User"); process.exit(1); } process.exit(0); }',
      'if (args.includes("migrate resolve")) process.exit(0);',
      'if (args.includes("migrate deploy")) {',
      '  const count = (fs.readFileSync(calls, "utf8").match(/migrate deploy/g) || []).length;',
      '  if (count === 1) { console.error("Error: P3009"); console.error("The `20261014193427_init` migration started at 2026-10-15 10:32:25.619809 UTC failed"); process.exit(1); }',
      '  if (process.env.MIGRATE_TEST_MODE === "duplicate" && count === 2) { console.error("Error: P3018"); console.error("Migration name: 20261014195331_add_votes_and_proof_links"); console.error("Database error code: 42701"); console.error("ERROR: column \\"voteCount\\" of relation \\"Bug\\" already exists"); process.exit(1); }',
      '  process.exit(0);',
      '}',
      'process.exit(1);',
    ].join("\n");
    writeWindowsPrismaStub(dir, js);
    env.MIGRATE_TEST_MODE = mode;
  } else {
    const prisma = join(dir, "node_modules/.bin/prisma");
    writeFileSync(prisma, script.replaceAll("__CALLS__", calls));
    chmodSync(prisma, 0o755);
  }
  const result = spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    cwd: dir,
    env: { PATH: process.env.PATH, MIGRATE_TEST_CALLS: calls, ...env } as unknown as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  const log = (() => {
    try {
      return readFileSync(calls, "utf8");
    } catch {
      return "";
    }
  })();
  return { status: result.status, output: `${result.stdout}${result.stderr}`, calls: log };
}

function writeWindowsPrismaStub(dir: string, source: string) {
  const binDir = join(dir, "node_modules/.bin");
  writeFileSync(join(binDir, "prisma-stub.cjs"), source);
  writeFileSync(
    join(binDir, "prisma.cmd"),
    `@echo off\r\n"${process.execPath}" "%~dp0prisma-stub.cjs" %*\r\nexit /b %ERRORLEVEL%\r\n`,
  );
}
function initThenSuccessStub() {
  return `#!/bin/sh
echo "prisma $*" >> "__CALLS__"
case "$*" in
  *db\\ execute*) exit 0 ;;
  *migrate\\ resolve*) exit 0 ;;
  *migrate\\ deploy*)
    n=$(grep -c "migrate deploy" "__CALLS__" || true)
    if [ "$n" -eq 1 ]; then
      echo "Error: P3009" >&2
      echo "The \\\`20261014193427_init\\\` migration started at 2026-10-15 10:32:25.619809 UTC failed" >&2
      exit 1
    fi
    exit 0
    ;;
esac
exit 1
`;
}

function initMissingUserStub() {
  return `#!/bin/sh
echo "prisma $*" >> "__CALLS__"
case "$*" in
  *db\\ execute*) echo "missing User" >&2; exit 1 ;;
  *migrate\\ deploy*)
    echo "Error: P3009" >&2
    echo "The \\\`20261014193427_init\\\` migration started at 2026-10-15 10:32:25.619809 UTC failed" >&2
    exit 1
    ;;
esac
exit 1
`;
}

function duplicateColumnStub() {
  return `#!/bin/sh
echo "prisma $*" >> "__CALLS__"
case "$*" in
  *db\\ execute*) exit 0 ;;
  *migrate\\ resolve*) exit 0 ;;
  *migrate\\ deploy*)
    n=$(grep -c "migrate deploy" "__CALLS__" || true)
    if [ "$n" -eq 1 ]; then
      echo "Error: P3009" >&2
      echo "The \\\`20261014193427_init\\\` migration started at 2026-10-15 10:32:25.619809 UTC failed" >&2
      exit 1
    fi
    if [ "$n" -eq 2 ]; then
      echo "Error: P3018" >&2
      echo "Migration name: 20261014195331_add_votes_and_proof_links" >&2
      echo "Database error code: 42701" >&2
      echo "ERROR: column \\"voteCount\\" of relation \\"Bug\\" already exists" >&2
      exit 1
    fi
    exit 0
    ;;
esac
exit 1
`;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const DB = "postgresql://u:p@localhost:5432/db";

describe("scripts/migrate.mjs exit code (#580)", () => {
  it("exits 0 when migrations apply", () => {
    const { status, calls } = run(0, { NODE_ENV: "production", DATABASE_URL: DB });
    expect(status).toBe(0);
    expect(calls).toContain("prisma migrate deploy");
  });

  it("exits non-zero in production when migrations still fail after every repair", () => {
    const { status, output } = run(1, { NODE_ENV: "production", DATABASE_URL: DB });
    expect(status).toBe(1);
    expect(output).toContain("Not starting the server");
  });

  it("can be told to start anyway during an incident", () => {
    const { status } = run(1, { NODE_ENV: "production", DATABASE_URL: DB, ALLOW_START_WITH_FAILED_MIGRATION: "true" });
    expect(status).toBe(0);
  });

  it("only warns outside production", () => {
    const { status, output } = run(1, { NODE_ENV: "development", DATABASE_URL: DB });
    expect(status).toBe(0);
    expect(output).toContain("Continuing outside production");
  });

  it("refuses to start in production with no DATABASE_URL (#220)", () => {
    const { status, calls } = run(0, { NODE_ENV: "production" });
    expect(status).toBe(1);
    expect(calls).toBe("");
  });

  it("migrates through the direct Neon host when DATABASE_URL is pooled", () => {
    const pooled =
      "postgresql://user:secret-pooler@ep-example-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require";
    const { status, calls, output } = run(0, { NODE_ENV: "production", DATABASE_URL: pooled });
    expect(status).toBe(0);
    expect(calls).toContain("ep-example.c-7.us-east-2.aws.neon.tech");
    expect(calls).not.toContain("ep-example-pooler");
    expect(output).toContain("direct connection");
  });

  it("records the failed init migration as applied when User already exists", () => {
    const { status, calls, output } = runStub(initThenSuccessStub(), {
      NODE_ENV: "production",
      DATABASE_URL: DB,
    });
    expect(status).toBe(0);
    expect(calls).toContain("migrate resolve --applied 20261014193427_init");
    expect(output).toContain("User already exists");
  });

  it("does not mark init applied when the User table is missing", () => {
    const { status, calls } = runStub(initMissingUserStub(), {
      NODE_ENV: "production",
      DATABASE_URL: DB,
    });
    expect(status).toBe(1);
    expect(calls).not.toContain("migrate resolve");
  });

  it("records a later migration applied when its objects already exist", () => {
    const { status, calls } = runStub(duplicateColumnStub(), {
      NODE_ENV: "production",
      DATABASE_URL: DB,
    });
    expect(status).toBe(0);
    expect(calls).toContain("migrate resolve --applied 20261014193427_init");
    expect(calls).toContain("migrate resolve --applied 20261014195331_add_votes_and_proof_links");
  }, 15_000);

  it("the Dockerfile only starts the server when the script succeeds", () => {
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toMatch(/node scripts\/migrate\.mjs && (pnpm run start|node server\.js)/);
    expect(dockerfile).not.toContain("migrate.mjs || true");
  });
});
