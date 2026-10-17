import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isAdmin,
  resolveEffectiveRole,
  ACTIVE_ROLE_COOKIE_NAME,
} from "@/lib/roles";
import { isPasswordAuthEnabled } from "@/lib/auth-mode";
import { upsertGoogleUser } from "@/lib/google-user";
import { resolveSessionUserId } from "@/lib/session-user";
import { isSuperAdminEmail } from "@/lib/super-admin";

/** Route handler that clears an invalid session (see app/session-expired/route.ts). */
export const SESSION_EXPIRED_PATH = "/session-expired";

export type SessionAppUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
  isRealSuperAdmin?: boolean;
  isRealAdmin?: boolean;
};

/**
 * App-layout gate. Uses the same JWT session as edge middleware (auth.config).
 * Missing session → redirect to login.
 * Stale JWT (cookie present, user gone from DB, or issued before a password
 * reset) → /session-expired, a route handler that clears the cookie and goes
 * to login. Calling signOut() here would throw: Server Components can't set
 * cookies.
 */
export async function requireUser(): Promise<SessionAppUser> {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const resolved = await resolveSessionUserId();
  let userId: string;
  if ("error" in resolved) {
    const email = session.user.email?.toLowerCase();
    // A session with an email and no matching row was saved under Google's subject, not User.id.
    if (!email || isPasswordAuthEnabled()) {
      redirect(SESSION_EXPIRED_PATH);
    }
    try {
      const googleAccount = await upsertGoogleUser({
        email,
        name: session.user.name,
        image: session.user.image,
      });
      if ((session.user.sessionVersion ?? 0) !== googleAccount.sessionVersion) {
        redirect(SESSION_EXPIRED_PATH);
      }
      userId = googleAccount.id;
    } catch (error) {
      console.error("[auth] Google session could not be linked to a user", error);
      redirect(SESSION_EXPIRED_PATH);
    }
  } else {
    userId = resolved.userId;
  }

  const dbUser = await prisma.user
    .findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true, role: true },
    })
    .catch(async () => {
      const basic = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });
      if (!basic) return null;
      return { ...basic, image: null, role: "user" as Role };
    });

  if (!dbUser) {
    redirect(SESSION_EXPIRED_PATH);
  }

  const isRealSuperAdmin =
    dbUser.role === "super_admin" || isSuperAdminEmail(dbUser.email);
  const isRealAdmin = isRealSuperAdmin || dbUser.role === "admin";

  if (dbUser.role !== "super_admin" && isSuperAdminEmail(dbUser.email)) {
    try {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { role: "super_admin" },
      });
      dbUser.role = "super_admin";
    } catch (error) {
      console.error("[auth] super admin role update failed", error);
    }
  }

  const cookieStore = await cookies();
  const activeRoleOverride = cookieStore.get(ACTIVE_ROLE_COOKIE_NAME)?.value;
  const effectiveRole = resolveEffectiveRole({
    isRealSuperAdmin,
    baseRole: dbUser.role,
    activeRoleOverride,
    currentUserId: dbUser.id,
  });

  return {
    id: dbUser.id,
    name: dbUser.name,
    email: dbUser.email,
    image: dbUser.image,
    role: effectiveRole,
    isRealSuperAdmin,
    isRealAdmin,
  };
}

/** Require one of the given roles. Redirects unauthorized users to /bugs. */
export async function requireRole(
  roles: Role | Role[],
): Promise<SessionAppUser> {
  const user = await requireUser();
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(user.role)) {
    redirect("/bugs");
  }
  return user;
}

/** Admin or super_admin. Redirects non-admins to /bugs. */
export async function requireAdmin(): Promise<SessionAppUser> {
  const user = await requireUser();
  if (!isAdmin(user.role)) {
    redirect("/bugs");
  }
  return user;
}

/** Super admin only. Redirects everyone else to /bugs. */
export async function requireSuperAdmin(): Promise<SessionAppUser> {
  return requireRole("super_admin");
}
