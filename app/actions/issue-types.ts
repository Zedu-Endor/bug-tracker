"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { canDeleteIssueType, issueTypeInputSchema } from "@/lib/issue-types";
import { typeChangedSummary } from "@/lib/activity-log";

export type IssueTypeActionResult = { error?: string; ok?: boolean };

const TYPE_NOT_FOUND = "Type not found";

/** Prisma P2025: the row was deleted (e.g. by another admin) before we wrote to it. */
function isRecordNotFound(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && "code" in err && err.code === "P2025"
  );
}

export async function createIssueTypeAction(
  formData: FormData,
): Promise<IssueTypeActionResult> {
  await requireAdmin();

  const rawName = formData.get("name")?.toString() ?? "";
  const rawDesc = formData.get("description")?.toString() ?? "";
  const rawActive = formData.get("isActive");
  const isActive = rawActive !== null ? rawActive === "true" || rawActive === "on" : true;

  const parsed = issueTypeInputSchema.safeParse({
    name: rawName,
    description: rawDesc ? rawDesc : null,
    isActive,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const normalizedName = parsed.data.name.trim();

  const existing = await prisma.issueType.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return { error: `A type named "${existing.name}" already exists.` };
  }

  try {
    await prisma.issueType.create({
      data: {
        name: normalizedName,
        description: parsed.data.description,
        isActive: parsed.data.isActive,
      },
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "P2002"
    ) {
      return { error: `A type named "${normalizedName}" already exists.` };
    }
    throw err;
  }

  revalidatePath("/admin/types");
  revalidatePath("/bugs/new");
  return { ok: true };
}

export async function updateIssueTypeAction(
  id: string,
  formData: FormData,
): Promise<IssueTypeActionResult> {
  const admin = await requireAdmin();

  if (!id || typeof id !== "string") {
    return { error: "Invalid type ID" };
  }

  const rawName = formData.get("name")?.toString() ?? "";
  const rawDesc = formData.get("description")?.toString() ?? "";
  const rawActive = formData.get("isActive");
  const isActive = rawActive !== null ? rawActive === "true" || rawActive === "on" : true;

  const parsed = issueTypeInputSchema.safeParse({
    name: rawName,
    description: rawDesc ? rawDesc : null,
    isActive,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const normalizedName = parsed.data.name.trim();

  const currentType = await prisma.issueType.findUnique({
    where: { id },
  });

  if (!currentType) {
    return { error: TYPE_NOT_FOUND };
  }

  const existing = await prisma.issueType.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
      NOT: { id },
    },
  });

  if (existing) {
    return { error: `Another type named "${existing.name}" already exists.` };
  }

  let linkedBugIds: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.issueType.update({
        where: { id },
        data: {
          name: normalizedName,
          description: parsed.data.description,
          isActive: parsed.data.isActive,
        },
      });

      if (currentType.name !== normalizedName) {
        const linkedBugs = await tx.bug.findMany({
          where: { typeId: id },
          select: { id: true },
        });

        if (linkedBugs.length > 0) {
          linkedBugIds = linkedBugs.map((b) => b.id);
          await tx.bugActivity.createMany({
            data: linkedBugs.map((b) => ({
              bugId: b.id,
              actorId: admin.id,
              type: "type_changed",
              summary: typeChangedSummary(currentType.name, normalizedName),
              metadata: {
                field: "type",
                from: currentType.name,
                to: normalizedName,
              },
            })),
          });
        }
      }
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "P2002"
    ) {
      return { error: `Another type named "${normalizedName}" already exists.` };
    }
    if (isRecordNotFound(err)) {
      return { error: TYPE_NOT_FOUND };
    }
    throw err;
  }

  revalidatePath("/admin/types");
  revalidatePath("/bugs/new");
  revalidatePath("/bugs");
  for (const bugId of linkedBugIds) {
    revalidatePath(`/bugs/${bugId}`);
  }
  return { ok: true };
}

export async function toggleIssueTypeActiveAction(
  id: string,
): Promise<IssueTypeActionResult> {
  await requireAdmin();

  if (!id || typeof id !== "string") {
    return { error: "Invalid type ID" };
  }

  const existing = await prisma.issueType.findUnique({
    where: { id },
    select: { isActive: true },
  });

  if (!existing) {
    return { error: "Type not found" };
  }

  await prisma.issueType.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });

  revalidatePath("/admin/types");
  revalidatePath("/bugs/new");
  return { ok: true };
}

export async function deleteIssueTypeAction(
  id: string,
): Promise<IssueTypeActionResult> {
  await requireAdmin();

  if (!id || typeof id !== "string") {
    return { error: "Invalid type ID" };
  }

  const existing = await prisma.issueType.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return { error: TYPE_NOT_FOUND };
  }

  const count = await prisma.bug.count({
    where: { typeId: id },
  });

  const check = canDeleteIssueType(count);
  if (!check.allowed) {
    return { error: check.reason };
  }

  try {
    await prisma.issueType.delete({
      where: { id },
    });
  } catch (err: unknown) {
    if (isRecordNotFound(err)) {
      return { error: TYPE_NOT_FOUND };
    }
    throw err;
  }

  revalidatePath("/admin/types");
  revalidatePath("/bugs/new");
  return { ok: true };
}

