import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validations/bug";
import type { Role } from "@prisma/client";
import authConfig from "@/auth.config";
import { cleanEnv } from "@/lib/env-clean";
import { isPasswordAuthEnabled } from "@/lib/auth-mode";
import { upsertGoogleUser } from "@/lib/google-user";
import { checkAuthRateLimit, clientIpFrom } from "@/lib/rate-limit";

const googleClientId = cleanEnv(
  process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID,
);
const googleClientSecret = cleanEnv(
  process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET,
);
const googleConfigured = Boolean(googleClientId) && Boolean(googleClientSecret);
// Google-only in production; see lib/auth-mode.ts for the AUTH_PASSWORD_LOGIN flag.
const passwordAuthEnabled = isPasswordAuthEnabled();

if (process.env.NODE_ENV !== "test") {
  console.log("[auth:config] Initializing NextAuth with Google OAuth status:", {
    googleConfigured,
    passwordAuthEnabled,
    clientIdPresent: Boolean(googleClientId),
    clientSecretPresent: Boolean(googleClientSecret),
    clientIdPrefix: googleClientId ? `${googleClientId.slice(0, 12)}…` : "none",
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: googleClientId!,
            clientSecret: googleClientSecret!,
          }),
        ]
      : []),

    ...(passwordAuthEnabled
      ? [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        if (!isPasswordAuthEnabled()) {
          return null;
        }
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          return null;
        }

        // Per-email and per-IP limit on password attempts (#207). Every
        // password sign-in comes through here, whichever entry point it used.
        const limit = checkAuthRateLimit("login", {
          email: parsed.data.email,
          ip: request?.headers ? clientIpFrom(request.headers) : null,
        });
        if (!limit.allowed) {
          console.warn("[auth] password sign-in rate limited", { email: parsed.data.email });
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        if (!user?.passwordHash) {
          return null;
        }

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user, account, profile }) {
      if (account?.provider === "google") {
        const email =
          typeof profile?.email === "string"
            ? profile.email.toLowerCase()
            : typeof user?.email === "string"
              ? user.email.toLowerCase()
              : null;
        if (email) {
          const name =
            (typeof profile?.name === "string" && profile.name) ||
            user?.name ||
            email.split("@")[0];
          const image =
            (typeof profile?.picture === "string" && profile.picture) ||
            (typeof user?.image === "string" ? user.image : undefined);

          let dbUser: { id: string; name: string; role: Role } | null = null;
          let lastError: unknown;
          for (let attempt = 1; attempt <= 3; attempt++) {
            try {
              dbUser = await upsertGoogleUser({ email, name, image });
              break;
            } catch (dbError) {
              lastError = dbError;
              console.error(`[auth] Google user save attempt ${attempt} failed:`, dbError);
              if (attempt < 3) {
                await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
              }
            }
          }

          if (!dbUser) {
            throw lastError instanceof Error
              ? lastError
              : new Error("Google sign-in could not save the user");
          }

          token.email = email;
          token.name = dbUser.name || name;
          token.id = dbUser.id;
          token.sub = dbUser.id;
          token.role = dbUser.role;
          token.sv = 0;
          return token;
        }
      }

      if (user?.id) {
        token.id = user.id;
        token.sub = user.id;
      }
      if (user?.role) {
        token.role = user.role;
      }
      if (typeof user?.sessionVersion === "number") {
        token.sv = user.sessionVersion;
      }
      return token;
    },
  },
});
