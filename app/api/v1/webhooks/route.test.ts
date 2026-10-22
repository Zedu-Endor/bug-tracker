import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

process.env.WEBHOOK_SECRET_KEY = "0".repeat(64);

const db = vi.hoisted(() => ({
  agentApiKey: { findUnique: vi.fn() },
  agentAuditEvent: { create: vi.fn() },
  webhookSubscription: { findMany: vi.fn(), create: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
}));
const budget = vi.hoisted(() => vi.fn());
const checkSsrfMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/agents/rate-budget", async (original) => ({
  ...(await original<typeof import("@/lib/agents/rate-budget")>()),
  consumeAgentBudget: budget,
}));
vi.mock("@/lib/webhooks/ssrf", () => ({
  checkSsrf: checkSsrfMock,
}));

import { GET, POST } from "./route";

function request(method: "GET" | "POST", body?: unknown, keyed = true, level = "contributor") {
  return new NextRequest("http://localhost/api/v1/webhooks", {
    method,
    headers: {
      ...(keyed ? { authorization: `Bearer ziki_test-key-${level}` } : {}),
      "content-type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function key(level = "contributor") {
  return {
    id: "key-a",
    revokedAt: null,
    agent: {
      id: "agent-a",
      name: "Agent",
      ownerUserId: "owner",
      tenantId: "tenant-a",
      level,
      burst: false,
      revokedAt: null,
      owner: { memberships: [{ tenantId: "tenant-a" }] },
    },
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  db.agentApiKey.findUnique.mockResolvedValue(key("contributor"));
  budget.mockResolvedValue({ allowed: true });
  db.webhookSubscription.findMany.mockResolvedValue([]);
  db.webhookSubscription.count.mockResolvedValue(0);
  db.webhookSubscription.findFirst.mockResolvedValue(null);
  db.webhookSubscription.create.mockResolvedValue({
    id: "sub-1",
    agentId: "agent-a",
    url: "https://example.com/webhook",
    events: [],
    enabled: true,
    failureCount: 0,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  checkSsrfMock.mockResolvedValue({ ok: true, address: "93.184.216.34" });
});

describe("POST /api/v1/webhooks validation (#499)", () => {
  it("rejects an invalid URL and names the url field", async () => {
    const res = await POST(request("POST", { url: "not-a-valid-url" }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("url");
    expect(data.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["url"] })]),
    );
  });

  it("rejects a bad events entry and names the events index", async () => {
    const res = await POST(
      request("POST", {
        url: "https://example.com/webhook",
        events: ["issue.created", ""],
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("events.1");
    expect(data.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["events", 1] })]),
    );
  });

  it("rejects unrecognized keys and names the unknown field", async () => {
    const res = await POST(
      request("POST", {
        url: "https://example.com/webhook",
        secret: "malicious-or-typo-field",
      }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("secret");
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unrecognized_keys", keys: ["secret"] }),
      ]),
    );
  });

  it("gives distinct error messages for bad url, bad events, and unknown fields", async () => {
    const urlRes = await POST(request("POST", { url: "not-a-url" }));
    const eventsRes = await POST(
      request("POST", {
        url: "https://example.com/webhook",
        events: [""],
      }),
    );
    const unknownRes = await POST(
      request("POST", {
        url: "https://example.com/webhook",
        extra: true,
      }),
    );

    const urlData = await urlRes.json();
    const eventsData = await eventsRes.json();
    const unknownData = await unknownRes.json();

    expect(urlData.error).not.toBe(eventsData.error);
    expect(urlData.error).not.toBe(unknownData.error);
    expect(eventsData.error).not.toBe(unknownData.error);
  });

  it("creates a subscription when the payload is valid", async () => {
    const res = await POST(
      request("POST", {
        url: "https://example.com/webhook",
        events: ["issue.created"],
      }),
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.subscription.url).toBe("https://example.com/webhook");
    expect(data.subscription.signingSecret).toBeDefined();
  });
});

describe("GET /api/v1/webhooks", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await GET(request("GET", undefined, false));
    expect(res.status).toBe(401);
  });

  it("lists webhook subscriptions for an authenticated agent", async () => {
    db.webhookSubscription.findMany.mockResolvedValue([
      {
        id: "sub-1",
        url: "https://example.com/webhook",
        enabled: true,
        events: [],
        failureCount: 0,
        disabledAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    const res = await GET(request("GET"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.subscriptions).toHaveLength(1);
    expect(data.subscriptions[0].id).toBe("sub-1");
  });
});

