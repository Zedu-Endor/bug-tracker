"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { refuseRoleChange, ROLE_CHANGE_ERRORS } from "@/lib/role-changes";
import type { Role } from "@prisma/client";

export type AdminActionResult = { error?: string; ok?: boolean };

/**
 * Apply a role change requested by a super admin.
 *
 * Both directions share one guard set: a super admin cannot edit their own
 * role or another super admin's, so the last super admin cannot be stripped
 * and leave the app with nobody able to restore access.
 */
async function changeUserRole(
  userId: string,
  nextRole: Role,
): Promise<AdminActionResult> {
  const actor = await requireSuperAdmin();

  if (!userId || typeof userId !== "string") {
    return { error: "Invalid user" };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  const refusal = refuseRoleChange(actor.id, target, nextRole);
  if (refusal) {
    return { error: ROLE_CHANGE_ERRORS[refusal] };
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: nextRole,
      sessionVersion: { increment: 1 },
    },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

/** Promote a user to admin. Super admins only. */
export async function promoteUserToAdminAction(
  userId: string,
): Promise<AdminActionResult> {
  return changeUserRole(userId, "admin");
}

/**
 * Remove admin privileges, returning the user to the regular `user` role.
 * Super admins only, and never applied to a super admin.
 */
export async function demoteUserToUserAction(
  userId: string,
): Promise<AdminActionResult> {
  return changeUserRole(userId, "user");
}