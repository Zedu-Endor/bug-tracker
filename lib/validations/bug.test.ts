import { describe, expect, it } from "vitest";
import {
  commentSchema,
  createBugSchema,
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
});

describe("updateBugSchema", () => {
  it("accepts a partial status update", () => {
    const result = updateBugSchema.safeParse({ status: "resolved" });
    expect(result.success).toBe(true);
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
  it("parses newline-separated http(s) URLs", () => {
    const result = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks:
        "https://example.com/a.png\nhttps://example.com/b.mp4\n",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proofLinks).toEqual([
        "https://example.com/a.png",
        "https://example.com/b.mp4",
      ]);
    }
  });

  it("rejects non-http proof URLs", () => {
    const result = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks: "ftp://files.example.com/shot.png",
    });
    expect(result.success).toBe(false);
  });

  it("deduplicates identical proof URLs", () => {
    const result = createBugSchema.safeParse({
      title: "Broken upload button",
      description: "Upload never completes on Chrome 130.",
      proofLinks:
        "https://example.com/a.png\nhttps://example.com/a.png\nhttps://example.com/b.png",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proofLinks).toEqual([
        "https://example.com/a.png",
        "https://example.com/b.png",
      ]);
    }
  });
});
