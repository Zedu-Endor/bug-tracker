import "server-only";
import { prisma } from "@/lib/prisma";
import {
  buildPointChart,
  defaultPointWindow,
  resolvePointChartRange,
  type PointChart,
  type PointPeriod,
} from "@/lib/point-periods";

/**
 * One person's real point ledger, bucketed for the Overview chart. Only the
 * fixed window is read (a year of daily rows would be a lot for one card);
 * the date picker trims those buckets rather than inventing a longer series.
 */
export async function loadPointChart({
  userId,
  tenantId,
  period,
  from,
  to,
  now = new Date(),
}: {
  userId: string;
  tenantId: string | null;
  period: PointPeriod;
  from?: unknown;
  to?: unknown;
  now?: Date;
}): Promise<PointChart> {
  const range = resolvePointChartRange(period, { from, to }, now);
  const window = defaultPointWindow(period, now);

  if (!tenantId) {
    return buildPointChart({ period, entries: [], range, now });
  }

  const entries = await prisma.pointEntry.findMany({
    where: {
      tenantId,
      userId,
      createdAt: { gte: window.from, lt: window.to },
    },
    select: { points: true, createdAt: true },
  });

  return buildPointChart({ period, entries, range, now });
}
