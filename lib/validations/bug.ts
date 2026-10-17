import { z } from "zod";
import { isGitHubUrl, splitProofLinkLines } from "@/lib/proof-links";
import { stripGitHubMarkup } from "@/lib/github-paste";

export const severities = ["low", "medium", "high", "critical"] as const;
export const statuses = ["open", "in_progress", "resolved", "closed"] as const;

export const severitySchema = z.enum(severities);
export const statusSchema = z.enum(statuses);

const MAX_PROOF_LINKS = 20;

/** Optional newline-separated GitHub URLs for issues / PRs. */
export const proofLinksInputSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value?.trim()) return [];

    const rawLines = value.split(/\r?\n/);
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]?.trim();
      if (!line) continue;
      if (!isGitHubUrl(line)) {
        ctx.addIssue({
          code: "custom",
          message: `Line ${i + 1} is not a valid GitHub URL: "${line}"`,
        });
        return z.NEVER;
      }
    }

    const rawLinks = splitProofLinkLines(value);
    const links = [...new Set(rawLinks)];
    const count =
      rawLinks.length > links.length && rawLinks.length > MAX_PROOF_LINKS
        ? rawLinks.length
        : links.length;
    if (links.length > MAX_PROOF_LINKS || rawLinks.length > MAX_PROOF_LINKS) {
      ctx.addIssue({
        code: "custom",
        message: `You entered ${count} links. At most ${MAX_PROOF_LINKS} proof links are allowed.`,
      });
      return z.NEVER;
    }
    return links;
  });

/** Create payload — status is rejected; the server always sets `open`. */
export const createBugSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters"),
    description: z
      .string()
      .trim()
      .transform((val) => stripGitHubMarkup(val))
      .refine((val) => val.length >= 10, {
        message: "Description must be at least 10 characters",
      })
      .refine((val) => val.length <= 5000, {
        message: "Description cannot exceed 5000 characters",
      }),
    severity: severitySchema.default("medium"),
    typeId: z.string().optional().nullable().or(z.literal("")),
    assigneeId: z.string().cuid().optional().or(z.literal("")),
    categoryId: z.string().optional().or(z.literal("")),
    proofLinks: proofLinksInputSchema,
  })
  .strict();

export const updateBugSchema = z.object({
  status: statusSchema.optional(),
  typeId: z.string().nullable().optional().or(z.literal("")),
  assigneeId: z.string().cuid().nullable().optional().or(z.literal("")),
  severity: severitySchema.optional(),
  categoryId: z.string().nullable().optional().or(z.literal("")),
});

export const editBugContentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters")
      .max(200, "Title must be at most 200 characters"),
    description: z
      .string()
      .trim()
      .transform((val) => stripGitHubMarkup(val))
      .refine((val) => val.length >= 10, {
        message: "Description must be at least 10 characters",
      })
      .refine((val) => val.length <= 5000, {
        message: "Description cannot exceed 5000 characters",
      }),
  })
  .strict();

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Platform name must be at least 2 characters")
    .max(50, "Platform name must be at most 50 characters"),
});

export const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .transform((val) => stripGitHubMarkup(val))
    .refine((val) => val.length >= 1, {
      message: "Comment cannot be empty",
    })
    .refine((val) => val.length <= 2000, {
      message: "Comment cannot exceed 2000 characters",
    }),
  parentId: z
    .string()
    .cuid()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value && value.length > 0 ? value : undefined)),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128);

export const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters")
      .max(100),
    email: z
      .string()
      .trim()
      .email("Enter a valid email")
      .transform((value) => value.toLowerCase()),
    password: passwordField,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Enter a valid email")
    .transform((value) => value.toLowerCase()),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, "Reset link is invalid or expired"),
    password: passwordField,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
