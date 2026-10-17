import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { offboardUser } from "../lib/user-offboarding";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL integration tests");
}

// Never migrate, seed, or reset the caller's existing schema.
const schema = `offboarding_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.TEST_DATABASE_URL);
url.searchParams.set("schema", schema);
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });

beforeAll(async () => {
  await promisify(execFile)("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url.toString() },
    timeout: 60_000,
  });
});

afterAll(async () => {
  try {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await db.$disconnect();
  }
});

/** Create a test user with a unique email in the isolated test schema. */
function createUser() {
  return db.user.create({
    data: { name: "Test user", email: `${randomUUID()}@example.invalid` },
  });
}

/** Create departing and replacement users plus an issue with history to transfer. */
async function createHistory() {
  const source = await createUser();
  const replacement = await createUser();
  const bug = await db.bug.create({
    data: {
      title: "Offboarding regression",
      description: "Preserve the issue and its history",
      reporterId: source.id,
      assigneeId: source.id,
      comments: { create: { authorId: source.id, body: "Keep this comment" } },
      activities: {
        create: { actorId: source.id, type: "created", summary: "Issue created" },
      },
    },
  });
  return { source, replacement, bug };
}

describe("user deletion against migrated PostgreSQL (#356)", () => {
  it("clears assignments on direct deletion and preserves the issue and reporter", async () => {
    const reporter = await createUser();
    const assignee = await createUser();
    const bug = await db.bug.create({
      data: {
        title: "Assigned issue",
        description: "Keep after assignee deletion",
        reporterId: reporter.id,
        assigneeId: assignee.id,
      },
    });

    await db.user.delete({ where: { id: assignee.id } });

    expect(await db.bug.findUniqueOrThrow({ where: { id: bug.id } })).toMatchObject({
      assigneeId: null,
      reporterId: reporter.id,
      title: bug.title,
    });
  });

  it("repairs a restrictive assignee constraint without losing existing data", async () => {
    const reporter = await createUser();
    const assignee = await createUser();
    const bug = await db.bug.create({
      data: {
        title: "Existing assignment",
        description: "Exercise the upgrade migration",
        reporterId: reporter.id,
        assigneeId: assignee.id,
      },
    });
    const migration = await readFile(
      new URL("./migrations/20261017160000_add_assignee_set_null_on_delete/migration.sql", import.meta.url),
      "utf8",
    );

    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`ALTER TABLE "Bug"
        DROP CONSTRAINT "Bug_assigneeId_fkey",
        ADD CONSTRAINT "Bug_assigneeId_fkey" FOREIGN KEY ("assigneeId")
          REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);
      await tx.$executeRawUnsafe(migration);

      expect(await tx.bug.findUniqueOrThrow({ where: { id: bug.id } })).toMatchObject({
        assigneeId: assignee.id,
      });
      await tx.user.delete({ where: { id: assignee.id } });
      expect(await tx.bug.findUniqueOrThrow({ where: { id: bug.id } })).toMatchObject({
        assigneeId: null,
        reporterId: reporter.id,
      });
    });
  });

  it("reassigns required reporter, comment, and activity history before deletion", async () => {
    const { source, replacement, bug } = await createHistory();

    await offboardUser(db, source.id, replacement.id);

    expect(await db.user.findUnique({ where: { id: source.id } })).toBeNull();
    expect(await db.bug.findUniqueOrThrow({
      where: { id: bug.id },
      include: { comments: true, activities: true },
    })).toMatchObject({
      reporterId: replacement.id,
      assigneeId: null,
      comments: [{ authorId: replacement.id, body: "Keep this comment" }],
      activities: [{ actorId: replacement.id, summary: "Issue created" }],
    });
  });

  it("rejects a missing replacement without changing the user's history", async () => {
    const { source, bug } = await createHistory();

    await expect(offboardUser(db, source.id, "missing-user")).rejects.toMatchObject({
      code: "P2025",
    });

    expect(await db.user.findUnique({ where: { id: source.id } })).not.toBeNull();
    expect(await db.bug.findUniqueOrThrow({ where: { id: bug.id } })).toMatchObject({
      reporterId: source.id,
      assigneeId: source.id,
    });
  });

  it("rolls back every history transfer if deletion fails", async () => {
    const { source, replacement, bug } = await createHistory();
    // Model a remaining reference that prevents the final DELETE.
    await db.$executeRawUnsafe(`CREATE TABLE "OffboardingHold" (
      "userId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT
    )`);
    try {
      await db.$executeRaw`INSERT INTO "OffboardingHold" ("userId") VALUES (${source.id})`;

      await expect(offboardUser(db, source.id, replacement.id)).rejects.toMatchObject({
        code: "P2003",
      });

      expect(await db.user.findUnique({ where: { id: source.id } })).not.toBeNull();
      expect(await db.bug.findUniqueOrThrow({
        where: { id: bug.id },
        include: { comments: true, activities: true },
      })).toMatchObject({
        reporterId: source.id,
        assigneeId: source.id,
        comments: [{ authorId: source.id }],
        activities: [{ actorId: source.id }],
      });
    } finally {
      await db.$executeRawUnsafe('DROP TABLE "OffboardingHold"');
    }
  });

  it("rejects using the departing user as their own replacement", async () => {
    const { source, bug } = await createHistory();

    await expect(offboardUser(db, source.id, source.id)).rejects.toThrow(
      "The replacement user must be a different account",
    );

    expect(await db.user.findUnique({ where: { id: source.id } })).not.toBeNull();
    expect(await db.bug.findUniqueOrThrow({ where: { id: bug.id } })).toMatchObject({
      reporterId: source.id,
      assigneeId: source.id,
    });
  });
});
