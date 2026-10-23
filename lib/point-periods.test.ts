import { describe, expect, it } from "vitest";
import {
  MAX_POINT_RANGE_DAYS,
  buildPointChart,
  defaultPointWindow,
  nextPointPeriod,
  parsePointPeriod,
  pointBucketStarts,
  pointPeriodLabel,
  resolvePointChartRange,
  startOfUtcWeek,
} from "./point-periods";

const NOW = new Date("2026-10-22T12:00:00.000Z"); // A Thursday.
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("parsePointPeriod", () => {
  it("accepts the four tabs", () => {
    for (const value of ["daily", "weekly", "monthly", "yearly"] as const) {
      expect(parsePointPeriod(value)).toBe(value);
    }
  });

  it("falls back to weekly for anything else", () => {
    for (const value of [undefined, null, "", "Daily", "quarterly", 7]) {
      expect(parsePointPeriod(value)).toBe("weekly");
    }
  });
});

describe("defaultPointWindow", () => {
  it("shows seven days ending today", () => {
    const window = defaultPointWindow("daily", NOW);
    expect(iso(window.from)).toBe("2026-10-16");
    expect(iso(window.to)).toBe("2026-10-23");
  });

  it("shows eight weeks ending with this Monday", () => {
    const window = defaultPointWindow("weekly", NOW);
    expect(iso(window.from)).toBe("2026-08-31");
    expect(iso(window.to)).toBe("2026-10-26");
    expect(startOfUtcWeek(NOW).getUTCDay()).toBe(1);
  });

  it("shows twelve months including this one", () => {
    const window = defaultPointWindow("monthly", NOW);
    expect(iso(window.from)).toBe("2025-11-01");
    expect(iso(window.to)).toBe("2026-11-01");
  });

  it("shows five years including this one", () => {
    const window = defaultPointWindow("yearly", NOW);
    expect(iso(window.from)).toBe("2022-01-01");
    expect(iso(window.to)).toBe("2027-01-01");
  });
});

describe("bucket edges and labels", () => {
  it("labels days, weeks, months and years like the design", () => {
    expect(pointPeriodLabel("daily", utc("2026-10-16"))).toBe("16 Oct");
    expect(pointPeriodLabel("weekly", utc("2026-09-07"))).toBe("7 Sept");
    expect(pointPeriodLabel("monthly", utc("2025-11-01"))).toBe("Nov");
    expect(pointPeriodLabel("yearly", utc("2026-01-01"))).toBe("2026");
  });

  it("walks edges without drifting", () => {
    expect(iso(nextPointPeriod("daily", utc("2026-10-22")))).toBe("2026-10-23");
    expect(iso(nextPointPeriod("weekly", utc("2026-10-19")))).toBe("2026-10-26");
    expect(iso(nextPointPeriod("monthly", utc("2026-12-01")))).toBe("2027-01-01");
    expect(iso(nextPointPeriod("yearly", utc("2026-01-01")))).toBe("2027-01-01");
  });

  it("produces exactly the design's bucket counts", () => {
    const counts = { daily: 7, weekly: 8, monthly: 12, yearly: 5 } as const;
    for (const [period, count] of Object.entries(counts)) {
      const window = defaultPointWindow(period as keyof typeof counts, NOW);
      expect(pointBucketStarts(period as keyof typeof counts, window)).toHaveLength(count);
    }
  });
});

describe("buildPointChart", () => {
  const entries = [
    { points: 40, createdAt: new Date("2026-10-18T10:00:00.000Z") },
    { points: 110, createdAt: new Date("2026-10-20T10:00:00.000Z") },
    { points: 30, createdAt: new Date("2026-10-22T10:00:00.000Z") },
    { points: -10, createdAt: new Date("2026-10-22T11:00:00.000Z") },
    // Outside every window below; must not leak into a bucket.
    { points: 9999, createdAt: new Date("2020-01-01T00:00:00.000Z") },
  ];

  it("sums real entries into day buckets", () => {
    const range = resolvePointChartRange("daily", {}, NOW);
    const chart = buildPointChart({ period: "daily", entries, range, now: NOW });
    expect(chart.buckets).toHaveLength(7);
    expect(chart.buckets.find((bucket) => bucket.label === "18 Oct")?.points).toBe(40);
    expect(chart.buckets.find((bucket) => bucket.label === "20 Oct")?.points).toBe(110);
    // A correction in the same day reduces that day's total.
    expect(chart.buckets.find((bucket) => bucket.label === "22 Oct")?.points).toBe(20);
    expect(chart.total).toBe(170);
  });

  it("sums the current week", () => {
    const range = resolvePointChartRange("weekly", {}, NOW);
    const chart = buildPointChart({ period: "weekly", entries, range, now: NOW });
    expect(chart.total).toBe(170);
    expect(chart.buckets.at(-1)?.label).toBe("19 Oct");
    expect(chart.buckets.at(-1)?.points).toBe(130);
  });

  it("trims buckets to a custom range instead of inventing a longer series", () => {
    const daily = buildPointChart({
      period: "daily",
      entries,
      range: resolvePointChartRange("daily", { from: "2026-10-19", to: "2026-10-20" }, NOW),
      now: NOW,
    });
    expect(daily.buckets.map((bucket) => bucket.label)).toEqual(["19 Oct", "20 Oct"]);
    expect(daily.total).toBe(110);

    const weekly = buildPointChart({
      period: "weekly",
      entries,
      range: resolvePointChartRange("weekly", { from: "2026-10-19", to: "2026-10-22" }, NOW),
      now: NOW,
    });
    expect(weekly.buckets.map((bucket) => bucket.label)).toEqual(["19 Oct"]);

    const monthly = buildPointChart({
      period: "monthly",
      entries,
      range: resolvePointChartRange("monthly", { from: "2026-09-01", to: "2026-10-22" }, NOW),
      now: NOW,
    });
    expect(monthly.buckets.map((bucket) => bucket.label)).toEqual(["Sept", "Oct"]);

    const yearly = buildPointChart({
      period: "yearly",
      entries,
      range: resolvePointChartRange("yearly", { from: "2025-01-01", to: "2026-10-22" }, NOW),
      now: NOW,
    });
    expect(yearly.buckets.map((bucket) => bucket.label)).toEqual(["2025", "2026"]);
  });

  it("keeps zero buckets so quiet weeks are visible", () => {
    const range = resolvePointChartRange("weekly", {}, NOW);
    const chart = buildPointChart({ period: "weekly", entries: [], range, now: NOW });
    expect(chart.buckets).toHaveLength(8);
    expect(chart.buckets.every((bucket) => bucket.points === 0)).toBe(true);
    expect(chart.total).toBe(0);
  });

  it("returns no buckets when a custom range sits outside the window", () => {
    const range = resolvePointChartRange("daily", { from: "2025-01-01", to: "2025-01-07" }, NOW);
    const chart = buildPointChart({ period: "daily", entries, range, now: NOW });
    expect(chart.buckets).toEqual([]);
    expect(chart.total).toBe(0);
  });
});

describe("resolvePointChartRange", () => {
  it("marks the default window as not custom", () => {
    const range = resolvePointChartRange("weekly", {}, NOW);
    expect(range.custom).toBe(false);
    expect(range.days).toBe(56);
  });

  it("reads one-sided ranges against the default window", () => {
    const fromOnly = resolvePointChartRange("daily", { from: "2026-10-20" }, NOW);
    expect(iso(fromOnly.from)).toBe("2026-10-20");
    expect(iso(fromOnly.to)).toBe("2026-10-23");

    const toOnly = resolvePointChartRange("daily", { to: "2026-10-20" }, NOW);
    expect(iso(toOnly.from)).toBe("2026-10-16");
    expect(iso(toOnly.to)).toBe("2026-10-21");
  });

  it("reads a backwards range as the one the user meant", () => {
    const backwards = resolvePointChartRange("daily", { from: "2026-10-22", to: "2026-10-19" }, NOW);
    const forwards = resolvePointChartRange("daily", { from: "2026-10-19", to: "2026-10-22" }, NOW);
    expect(backwards).toEqual(forwards);
  });

  it("ignores invalid dates", () => {
    const range = resolvePointChartRange("daily", { from: "2026-02-31", to: "today" }, NOW);
    expect(range.custom).toBe(false);
  });

  it("caps a wide range at five years", () => {
    const range = resolvePointChartRange("yearly", { from: "2000-01-01", to: "2026-10-22" }, NOW);
    expect(range.days).toBe(MAX_POINT_RANGE_DAYS);
    expect(iso(range.to)).toBe("2026-10-23");
    expect(range.from.getTime()).toBe(range.to.getTime() - MAX_POINT_RANGE_DAYS * 86_400_000);
  });
});
