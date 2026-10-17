"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { categorySchema } from "@/lib/validations/bug";
import { categoryChangedSummary } from "@/lib/activity-log";

export type CategoryActionResult = {
  error?: string;
  ok?: boolean;
};

export async function createCategoryAction(
  formData: FormData,
): Promise<CategoryActionResult> {
  await requireAdmin();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid platform name" };
  }

  const normalizedName = parsed.data.name.trim();

  const existing = await prisma.category.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
    },
  });

  if (existing) {
    return { error: `A category named "${existing.name}" already exists.` };
  }

  try {
    await prisma.category.create({
      data: {
        name: normalizedName,
        isActive: true,
      },
    });
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      err.code === "P2002"
    ) {
      return { error: `A category named "${normalizedName}" already exists.` };
    }
    throw err;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/bugs/new");
  revalidatePath("/bugs");
  return { ok: true };
}

export async function updateCategoryAction(
  categoryId: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  const admin = await requireAdmin();

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid platform name" };
  }

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    return { error: "Platform not found" };
  }

  const normalizedName = parsed.data.name.trim();

  const duplicate = await prisma.category.findFirst({
    where: {
      name: {
        equals: normalizedName,
        mode: "insensitive",
      },
      NOT: { id: categoryId },
    },
  });

  if (duplicate) {
    return { error: `A category named "${duplicate.name}" already exists.` };
  }

  let linkedBugIds: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      await tx.category.update({
        where: { id: categoryId },
        data: { name: normalizedName },
      });

      if (category.name !== normalizedName) {
        const linkedBugs = await tx.bug.findMany({
          where: { categoryId },
          select: { id: true },
        });

        if (linkedBugs.length > 0) {
          linkedBugIds = linkedBugs.map((b) => b.id);
          await tx.bugActivity.createMany({
            data: linkedBugs.map((b) => ({
              bugId: b.id,
              actorId: admin.id,
              type: "category_changed",
              summary: categoryChangedSummary(category.name, normalizedName),
              metadata: {
                field: "category",
                from: category.name,
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
      return { error: `A category named "${normalizedName}" already exists.` };
    }
    throw err;
  }

  revalidatePath("/admin/categories");
  revalidatePath("/bugs/new");
  revalidatePath("/bugs");
  for (const bugId of linkedBugIds) {
    revalidatePath(`/bugs/${bugId}`);
  }
  return { ok: true };
}

export async function toggleCategoryStatusAction(
  categoryId: string,
): Promise<CategoryActionResult> {
  await requireAdmin();

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    return { error: "Platform not found" };
  }

  await prisma.category.update({
    where: { id: categoryId },
    data: { isActive: !category.isActive },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/bugs/new");
  revalidatePath("/bugs");
  return { ok: true };
}

export async function deleteCategoryAction(
  categoryId: string,
): Promise<CategoryActionResult> {
  await requireAdmin();

  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  });

  if (!category) {
    return { error: "Platform not found" };
  }

  const bugCount = await prisma.bug.count({
    where: { categoryId },
  });

  if (bugCount > 0) {
    return {
      error: `Cannot delete platform: it is currently used by ${bugCount} issue${bugCount === 1 ? "" : "s"}. Please reassign or deactivate it instead.`,
    };
  }

  try {
    await prisma.category.delete({
      where: { id: categoryId },
    });
  } catch {
    return { error: "Failed to delete platform" };
  }

  revalidatePath("/admin/categories");
  revalidatePath("/bugs/new");
  revalidatePath("/bugs");
  return { ok: true };
}
