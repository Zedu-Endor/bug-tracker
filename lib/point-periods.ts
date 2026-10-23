import { parseDateParam } from "@/lib/dashboard-range";

/**
 * Points-over-time buckets for the Overview "Your points" chart. Pure so the
 * bucket edges and labels can be tested without a database, and UTC so a
 * server in one region cannot shift a week for a reader in another.
 *
 * The chart keeps a fixed window per period, mirroring the design: the last
 * seven days, eight weeks, twelve months or five years. The date picker trims
 * those buckets to a chosen range; it never invents values.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

export const POINT_PERIODS = ["daily", "weekly", "monthly", "yearly"] as const;
export type PointPeriod = (typeof POINT_PERIODS)[number];
export const DEFAULT_POINT_PERIOD: PointPeriod = "weekly";

export const POINT_PERIOD_META: Record<
  PointPeriod,
  { label: string; caption: string }
> = {
  daily: { label: "Daily", caption: "Points earned each day, last 7 days" },
  weekly: {
    label: "Weekly",
    caption: "Points earned each week, last 8 weeks · 500 pts required, more is welcome",
  },
  monthly: { label: "Monthly", caption: "Points earned each month, last 12 months" },
  yearly: { label: "Yearly", caption: "Points earned each year, last 5 years" },
};

/** A period, or the weekly default when the URL says something else. */
export function parsePointPeriod(raw: unknown): PointPeriod {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === "string" && (POINT_PERIODS as readonly string[]).includes(value)
    ? (value as PointPeriod)
    : DEFAULT_POINT_PERIOD;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Monday 00:00 UTC of the week containing `date`. */
export function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return new Date(day.getTime() - daysSinceMonday * DAY_MS);
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function startOfUtcYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export function startOfPointPeriod(period: PointPeriod, date: Date): Date {
  if (period === "daily") return startOfUtcDay(date);
  if (period === "weekly") return startOfUtcWeek(date);
  if (period === "monthly") return startOfUtcMonth(date);
  return startOfUtcYear(date);
}

/** The next bucket edge after `date`, at the same period size. */
export function nextPointPeriod(period: PointPeriod, date: Date): Date {
  if (period === "daily") return new Date(date.getTime() + DAY_MS);
  if (period === "weekly") return new Date(date.getTime() + 7 * DAY_MS);
  if (period === "monthly") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  }
  return new Date(Date.UTC(date.getUTCFullYear() + 1, 0, 1));
}

export type PointWindow = {
  /** Inclusive start, 00:00 UTC. */
  from: Date;
  /** Exclusive end. */
  to: Date;
};

/**
 * The buckets the chart shows when no dates are picked. Each window ends one
 * bucket after today, so the current day/week/month/year is included in full.
 */
export function defaultPointWindow(period: PointPeriod, now = new Date()): PointWindow {
  const today = startOfUtcDay(now);
  if (period === "daily") {
    return {
      from: new Date(today.getTime() - 6 * DAY_MS),
      to: new Date(today.getTime() + DAY_MS),
    };
  }
  if (period === "weekly") {
    const week = startOfUtcWeek(today);
    return {
      from: new Date(week.getTime() - 7 * 7 * DAY_MS),
      to: new Date(week.getTime() + 7 * DAY_MS),
    };
  }
  if (period === "monthly") {
    const month = startOfUtcMonth(today);
    return {
      from: new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 11, 1)),
      to: new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1)),
    };
  }
  const year = today.getUTCFullYear();
  return {
    from: new Date(Date.UTC(year - 4, 0, 1)),
    to: new Date(Date.UTC(year + 1, 0, 1)),
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "16 Oct" for a day/week, "Nov" for a month, "2026" for a year. */
export function pointPeriodLabel(period: PointPeriod, start: Date): string {
  if (period === "monthly") return MONTHS[start.getUTCMonth()];
  if (period === "yearly") return String(start.getUTCFullYear());
  return `${start.getUTCDate()} ${MONTHS[start.getUTCMonth()]}`;
}

/** Every bucket edge in `window`, oldest first. */
export function pointBucketStarts(period: PointPeriod, window: PointWindow): Date[] {
  const starts: Date[] = [];
  let cursor = startOfPointPeriod(period, window.from);
  while (cursor < window.to) {
    starts.push(cursor);
    cursor = nextPointPeriod(period, cursor);
  }
  return starts;
}

/** A custom range from the URL, or the period's default window. */
export type PointChartRange = PointWindow & { custom: boolean; days: number };

/** Five years is as wide as the yearly view can usefully show. */
export const MAX_POINT_RANGE_DAYS = 366 * 5;

/**
 * Reads `?from=&to=`. Both ends are optional and inclusive days; anything
 * invalid, inverted or wider than the maximum falls back rather than erroring.
 */
export function resolvePointChartRange(
  period: PointPeriod,
  params: { from?: unknown; to?: unknown },
  now = new Date(),
): PointChartRange {
  const base = defaultPointWindow(period, now);
  const from = parseDateParam(params.from);
  const to = parseDateParam(params.to);
  if (!from && !to) {
    return {
      ...base,
      custom: false,
      days: Math.round((base.to.getTime() - base.from.getTime()) / DAY_MS),
    };
  }

  let first = from ?? startOfUtcDay(base.from);
  let last = to ?? new Date(base.to.getTime() - DAY_MS);
  if (first > last) [first, last] = [last, first];

  const end = new Date(last.getTime() + DAY_MS);
  let days = Math.round((end.getTime() - first.getTime()) / DAY_MS);
  if (days > MAX_POINT_RANGE_DAYS) {
    first = new Date(end.getTime() - MAX_POINT_RANGE_DAYS * DAY_MS);
    days = MAX_POINT_RANGE_DAYS;
  }

  return { from: first, to: end, custom: true, days };
}

export type PointBucket = {
  start: Date;
  end: Date;
  label: string;
  points: number;
};

export type PointChart = {
  buckets: PointBucket[];
  total: number;
  from: Date;
  to: Date;
  custom: boolean;
};

/**
 * Fills the period's buckets with real ledger points. Entries outside the
 * fixed window are ignored, and a zero bucket stays visible so the shape of
 * the week/month is honest about quiet stretches.
 */
export function buildPointChart({
  period,
  entries,
  range,
  now = new Date(),
}: {
  period: PointPeriod;
  entries: ReadonlyArray<{ points: number; createdAt: Date }>;
  range: PointChartRange;
  now?: Date;
}): PointChart {
  const base = defaultPointWindow(period, now);
  let starts = pointBucketStarts(period, base);
  if (range.custom) {
    starts = starts.filter(
      (start) => start < range.to && nextPointPeriod(period, start) > range.from,
    );
  }

  const totals = new Map<number, number>();
  for (const entry of entries) {
    const key = startOfPointPeriod(period, entry.createdAt).getTime();
    totals.set(key, (totals.get(key) ?? 0) + entry.points);
  }

  const buckets = starts.map((start) => {
    const end = nextPointPeriod(period, start);
    return {
      start,
      end,
      label: pointPeriodLabel(period, start),
      points: totals.get(start.getTime()) ?? 0,
    };
  });

  return {
    buckets,
    total: buckets.reduce((sum, bucket) => sum + bucket.points, 0),
    from: range.from,
    to: range.to,
    custom: range.custom,
  };
}
