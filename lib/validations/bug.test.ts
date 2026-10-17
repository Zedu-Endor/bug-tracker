import { describe, expect, it } from "vitest";
import {
  commentSchema,
  createBugSchema,
  editBugContentSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updateBugSchema,
} from "./bug";

const validCuid = "clxxxxxxxxxxxxxxxxxxxxxxxxx";

describe("createBugSchema", () => {
  it("accepts a valid bug payload", () => {
    const result = createBugSchema.safeParse({
      title: "Login button broken",
      description: "Clicking sign in does nothing on mobile.",
      severity: "high",
      assigneeId: validCuid,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe("high");
      expect(result.data.title).toBe("Login button broken");
    }
  });

  it("defaults severity to medium", () => {
    const result = createBugSchema.safeParse({
      title: "Missing favicon",
      description: "Browser tab shows the default Next icon.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.severity).toBe("medium");
    }
  });

  it("rejects a short title", () => {
    const result = createBugSchema.safeParse({
      title: "ab",
      description: "Long enough description for the schema.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 200 characters with friendly message", () => {
    const result = createBugSchema.safeParse({
      title: "a".repeat(201),
      description: "Long enough description for the schema.",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Title must be at most 200 characters",
      );
    }
  });

  it("rejects a short description", () => {
    const result = createBugSchema.safeParse({
      title: "Valid title here",
      description: "too short",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid severity", () => {
    const result = createBugSchema.safeParse({
      title: "Valid title here",
      description: "Long enough description for the schema.",
      severity: "urgent",
    });

    expect(result.success).toBe(false);
  });

  it("rejects client-provided status at creation", () => {
    const result = createBugSchema.safeParse({
      title: "Valid title here",
      description: "Long enough description for the schema.",
      status: "closed",
    });

    expect(result.success).toBe(false);
  });

  it("accepts an optional typeId", () => {
    const result = createBugSchema.safeParse({
      title: "Marketing banner misplaced",
      description: "Banner overlaps header on marketing landing page.",
      typeId: "type_marketing",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.typeId).toBe("type_marketing");
    }
  });

  it("does not expose status on a successful create parse", () => {
    const result = createBugSchema.safeParse({
      title: "Valid title here",
      description: "Long enough description for the schema.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("status");
    }
  });

  it("strips GitHub template comments from description during validation", () => {
    const result = createBugSchema.safeParse({
      title: "Valid title here",
      description:
        "<!-- Please write description here -->Legitimate bug details that exceed ten characters.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe(
        "Legitimate bug details that exceed ten characters.",
      );
      expect(result.data.description).not.toContain("Please write description");
    }
  });

  it("rejects descriptions that only contain GitHub template comments", () => {
    const result = createBugSchema.safeParse({
      title: "Valid title here",
      description: "<!-- Please write description here -->",
    });

    expect(result.success).toBe(false);
  });
});

describe("updateBugSchema", () => {
  it("accepts a partial status update", () => {
    const result = updateBugSchema.safeParse({ status: "resolved" });
    expect(result.success).toBe(true);
  });

  it("accepts a typeId update", () => {
    const result = updateBugSchema.safeParse({ typeId: "type_feat" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.typeId).toBe("type_feat");
    }
  });

  it("rejects an invalid status", () => {
    const result = updateBugSchema.safeParse({ status: "done" });
    expect(result.success).toBe(false);
  });

  it("allows clearing assignee with empty string", () => {
    const result = updateBugSchema.safeParse({ assigneeId: "" });
    expect(result.success).toBe(true);
  });
});

describe("commentSchema", () => {
  it("accepts a non-empty comment", () => {
    const result = commentSchema.safeParse({ body: "Looks fixed on staging." });
    expect(result.success).toBe(true);
  });

  it("rejects an empty comment", () => {
    const result = commentSchema.safeParse({ body: "   " });
    expect(result.success).toBe(false);
  });

  it("accepts an optional parentId for replies", () => {
    const result = commentSchema.safeParse({
      body: "Agree with this triage note.",
      parentId: validCuid,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBe(validCuid);
    }
  });

  it("treats empty parentId as a top-level comment", () => {
    const result = commentSchema.safeParse({
      body: "Top-level note.",
      parentId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.parentId).toBeUndefined();
    }
  });

  it("rejects an invalid parentId", () => {
    const result = commentSchema.safeParse({
      body: "Bad parent.",
      parentId: "not-a-cuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "alice@zendor.dev",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({
      email: "alice@zendor.dev",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("signupSchema", () => {
  it("accepts a valid signup payload", () => {
    const result = signupSchema.safeParse({
      name: "Dana Dev",
      email: "Dana@Zendor.dev",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("dana@zendor.dev");
    }
  });

  it("rejects mismatched passwords", () => {
    const result = signupSchema.safeParse({
      name: "Dana Dev",
      email: "dana@zendor.dev",
      password: "password123",
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = signupSchema.safeParse({
      name: "Dana Dev",
      email: "dana@zendor.dev",
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts and lowercases email", () => {
    const result = forgotPasswordSchema.safeParse({
      email: "Alice@Zendor.dev",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("alice@zendor.dev");
    }
  });

  it("rejects an invalid email", () => {
    const result = forgotPasswordSchema.safeParse({ email: "not-an-email" });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts a valid reset payload", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "password123",
      confirmPassword: "different1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = resetPasswordSchema.safeParse({
      token: "abc123",
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing token", () => {
    const result = resetPasswordSchema.safeParse({
      token: "",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(false);
  });
});

describe("createBugSchema proofLinks", () => {
  it("parses newline-separated GitHub URLs", () => {
    const result = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks:
        "https://github.com/org/repo/issues/12\nhttps://github.com/org/repo/pull/13\n",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proofLinks).toEqual([
        "https://github.com/org/repo/issues/12",
        "https://github.com/org/repo/pull/13",
      ]);
    }
  });

  it("rejects non-GitHub proof URLs with line number and URL", () => {
    const nonHttpResult = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks: "ftp://files.example.com/shot.png",
    });
    expect(nonHttpResult.success).toBe(false);
    if (!nonHttpResult.success) {
      expect(nonHttpResult.error.issues[0]?.message).toBe(
        'Line 1 is not a valid GitHub URL: "ftp://files.example.com/shot.png"',
      );
    }

    const nonGitHubResult = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks: "https://example.com/screenshot.png",
    });
    expect(nonGitHubResult.success).toBe(false);
    if (!nonGitHubResult.success) {
      expect(nonGitHubResult.error.issues[0]?.message).toBe(
        'Line 1 is not a valid GitHub URL: "https://example.com/screenshot.png"',
      );
    }
  });

  it("identifies the exact 1-indexed line number of malformed proof links (#363)", () => {
    const lines = [
      "https://github.com/org/repo/issues/1",
      "https://github.com/org/repo/issues/2",
      "https://github.com/org/repo/issues/3",
      "https://github.com/org/repo/issues/4",
      "https://github.com/org/repo/issues/5",
      "https://github.com/org/repo/issues/6",
      "https://github.com/org/repo/issues/7",
      "https://github.com/org/repo/pull/12]",
      "https://github.com/org/repo/issues/9",
    ].join("\n");

    const result = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks: lines,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Line 8 is not a valid GitHub URL: "https://github.com/org/repo/pull/12]"',
      );
    }
  });

  it("displays received link count and maximum limit when exceeding 20 links (#363)", () => {
    const twentyFourLinks = Array.from(
      { length: 24 },
      (_, i) => `https://github.com/org/repo/issues/${i + 1}`,
    ).join("\n");

    const result = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks: twentyFourLinks,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "You entered 24 links. At most 20 proof links are allowed.",
      );
    }
  });

  it("deduplicates identical proof links", () => {
    const result = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks:
        "https://github.com/org/repo/issues/12\nhttps://github.com/org/repo/issues/12\nhttps://github.com/org/repo/pull/13\nhttps://github.com/org/repo/issues/12\n",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proofLinks).toEqual([
        "https://github.com/org/repo/issues/12",
        "https://github.com/org/repo/pull/13",
      ]);
    }
  });
});

describe("editBugContentSchema", () => {
  it("accepts valid title and description", () => {
    const result = editBugContentSchema.safeParse({
      title: "Updated issue title",
      description: "Updated issue description with enough characters.",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe("Updated issue title");
      expect(result.data.description).toBe(
        "Updated issue description with enough characters.",
      );
    }
  });

  it("rejects title shorter than 3 characters", () => {
    const result = editBugContentSchema.safeParse({
      title: "ab",
      description: "Updated issue description with enough characters.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects title longer than 200 characters", () => {
    const result = editBugContentSchema.safeParse({
      title: "a".repeat(201),
      description: "Updated issue description with enough characters.",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Title must be at most 200 characters",
      );
    }
  });

  it("rejects description shorter than 10 characters", () => {
    const result = editBugContentSchema.safeParse({
      title: "Valid title",
      description: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects description longer than 5000 characters", () => {
    const result = editBugContentSchema.safeParse({
      title: "Valid title",
      description: "a".repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe("saving code samples (#114)", () => {
  const code = "```tsx\n<Provider store={store}>\n  <div className=\"app\" />\n</Provider>\nconst p: Promise<P> = load();\n```";

  it("keeps code blocks in issue descriptions", () => {
    const parsed = createBugSchema.safeParse({
      title: "Crash in provider",
      description: `Steps to reproduce:\n\n${code}`,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.description).toBe(`Steps to reproduce:\n\n${code}`);
  });

  it("keeps code blocks in comments", () => {
    const parsed = commentSchema.safeParse({ body: code });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).toBe(code);
  });
});

