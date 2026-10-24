import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECT_WORKFLOW,
  WORKFLOW_LIMITS,
  workflowSettingsSchema,
  workflowValues,
} from "./workflow-config";

describe("project workflow defaults (#595)", () => {
  it("reproduces the constants the gates used", () => {
    expect(DEFAULT_PROJECT_WORKFLOW).toEqual({
      confirmationsNeeded: 2,
      verdictsNeeded: 2,
      offerWindowSeconds: 60,
      heartbeatMinutes: 15,
      deliveryMinutes: 15,
      maxActiveClaims: 2,
      volunteerWindowSeconds: 120,
      autoMerge: true,
    });
  });

  it("uses defaults for a missing row", () => {
    expect(workflowValues(null)).toEqual(DEFAULT_PROJECT_WORKFLOW);
    expect(workflowValues({ confirmationsNeeded: 4 })).toMatchObject({
      confirmationsNeeded: 4,
      verdictsNeeded: 2,
      autoMerge: true,
    });
  });
});

describe("workflowSettingsSchema (#595)", () => {
  const valid = { ...DEFAULT_PROJECT_WORKFLOW };

  it("accepts every boundary", () => {
    expect(workflowSettingsSchema.safeParse({
      ...valid,
      confirmationsNeeded: WORKFLOW_LIMITS.confirmationsNeeded.min,
      verdictsNeeded: 5,
      offerWindowSeconds: 600,
      heartbeatMinutes: WORKFLOW_LIMITS.heartbeatMinutes.min,
      deliveryMinutes: WORKFLOW_LIMITS.deliveryMinutes.max,
      maxActiveClaims: 20,
      volunteerWindowSeconds: 3600,
    }).success).toBe(true);
    expect(workflowSettingsSchema.safeParse({
      ...valid,
      confirmationsNeeded: 5,
      verdictsNeeded: 1,
      offerWindowSeconds: 30,
      heartbeatMinutes: 1440,
      deliveryMinutes: 1,
      maxActiveClaims: 1,
      volunteerWindowSeconds: 30,
    }).success).toBe(true);
  });

  it("refuses values outside the documented ranges", () => {
    for (const [field, value] of [
      ["confirmationsNeeded", 0],
      ["confirmationsNeeded", 6],
      ["verdictsNeeded", 0],
      ["verdictsNeeded", 6],
      ["offerWindowSeconds", 29],
      ["offerWindowSeconds", 601],
    ] as const) {
      expect(workflowSettingsSchema.safeParse({ ...valid, [field]: value }).success).toBe(false);
    }
  });

  it("refuses non-integers, wrong types and a non-boolean autoMerge", () => {
    expect(workflowSettingsSchema.safeParse({ ...valid, confirmationsNeeded: 2.5 }).success).toBe(false);
    expect(workflowSettingsSchema.safeParse({ ...valid, offerWindowSeconds: "60" }).success).toBe(false);
    expect(workflowSettingsSchema.safeParse({ ...valid, autoMerge: "true" }).success).toBe(false);
  });
});

describe("delivery window boundaries (#632)", () => {
  const valid = { ...DEFAULT_PROJECT_WORKFLOW };

  it("accepts the endpoints of the documented range", () => {
    for (const deliveryMinutes of [
      WORKFLOW_LIMITS.deliveryMinutes.min,
      60,
      WORKFLOW_LIMITS.deliveryMinutes.max,
    ]) {
      expect(workflowSettingsSchema.safeParse({ ...valid, deliveryMinutes }).success).toBe(true);
    }
  });

  it("refuses zero, negative and above-maximum windows", () => {
    for (const deliveryMinutes of [0, -1, WORKFLOW_LIMITS.deliveryMinutes.max + 1]) {
      const result = workflowSettingsSchema.safeParse({ ...valid, deliveryMinutes });
      expect(result.success).toBe(false);
    }
  });

  it("falls back to the default for a missing or null stored window", () => {
    expect(workflowValues({ deliveryMinutes: undefined }).deliveryMinutes).toBe(
      DEFAULT_PROJECT_WORKFLOW.deliveryMinutes,
    );
    expect(workflowValues(null).deliveryMinutes).toBe(DEFAULT_PROJECT_WORKFLOW.deliveryMinutes);
  });
});

