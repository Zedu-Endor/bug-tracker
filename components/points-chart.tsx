"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DAY_MS,
  POINT_PERIODS,
  POINT_PERIOD_META,
  type PointPeriod,
} from "@/lib/point-periods";

/**
 * The Overview "Your points" chart. Server-rendered buckets, client-only
 * controls: range tabs are links, and the date picker rewrites `?from=&to=`.
 * No value in here is sample data — each bar is a real ledger sum.
 */

export type PointsChartBucket = {
  /** "16 Oct", "Nov", or "2026". */
  label: string;
  points: number;
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

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

/** "16 Oct 2026" from a YYYY-MM-DD value, without timezone drift. */
function formatDay(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

const DAY_MS_CLIENT = DAY_MS;

/** A YYYY-MM-DD value `days` before `today`. */
function daysBefore(today: string, days: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const start = Date.UTC(year, month - 1, day);
  return new Date(start - days * DAY_MS_CLIENT).toISOString().slice(0, 10);
}

function chartHref(period: PointPeriod, from: string, to: string): string {
  const params = new URLSearchParams();
  params.set("chart", period);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return `/dashboard?${params.toString()}`;
}

export function PointsChart({
  period,
  buckets,
  total,
  caption,
  from = "",
  to = "",
  today,
  target = null,
}: {
  period: PointPeriod;
  buckets: PointsChartBucket[];
  total: number;
  caption: string;
  /** Custom range values from the URL (YYYY-MM-DD), or empty strings. */
  from?: string;
  to?: string;
  /** Today in UTC, so presets are stable between server and client. */
  today: string;
  /** 500 for the weekly view; null for every other period. */
  target?: number | null;
}) {
  const router = useRouter();
  const [datesOpen, setDatesOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!datesOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setDatesOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDatesOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [datesOpen]);

  const toggleDates = () => {
    setDraftFrom(from);
    setDraftTo(to);
    setDatesOpen((open) => !open);
  };

  const applyDates = () => {
    setDatesOpen(false);
    router.push(chartHref(period, draftFrom, draftTo));
  };

  const clearDates = () => {
    setDraftFrom("");
    setDraftTo("");
    setDatesOpen(false);
    router.push(chartHref(period, "", ""));
  };

  const presets: { label: string; from: string; to: string }[] = [
    { label: "Last 7 days", from: daysBefore(today, 6), to: today },
    { label: "Last 30 days", from: daysBefore(today, 29), to: today },
    { label: "This month", from: `${today.slice(0, 7)}-01`, to: today },
    { label: "Last 3 months", from: daysBefore(today, 90), to: today },
    { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];

  const hasTarget = typeof target === "number" && target > 0;
  const max = Math.max(
    ...buckets.map((bucket) => bucket.points),
    hasTarget ? target * 1.15 : 1,
    1,
  );
  const targetPct = hasTarget ? Math.round((target / max) * 100) : 0;
  const lastIndex = buckets.length - 1;
  const dateLabel = from || to
    ? `${from ? formatDay(from) : "Start"} – ${to ? formatDay(to) : "Today"}`
    : "All dates";

  return (
    <section
      aria-label="Your points"
      className="flex flex-col gap-5 rounded-[20px] border border-line bg-surface p-[22px]"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold text-ink">Your points</h2>
          <span className="text-[13px] text-muted">{caption}</span>
          {hasTarget ? (
            <div className="mt-2 flex flex-wrap gap-4 text-[13px] text-ink-2">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-primary" />
                {target} reached
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-sky-tint" />
                Below {target}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-ink opacity-55" />
                Weekly requirement · {target} pts
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="relative">
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={datesOpen}
              onClick={toggleDates}
              className={`inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[13px] font-bold transition-colors ${focusRing} ${
                from || to || datesOpen
                  ? "border-primary bg-tint text-accent"
                  : "border-line bg-surface text-ink hover:bg-tint"
              }`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {dateLabel}
              <svg
                className={`h-3.5 w-3.5 ${datesOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {datesOpen ? (
              <div
                role="dialog"
                aria-label="Filter dates"
                className="absolute right-0 top-12 z-30 flex w-[320px] max-w-[calc(100vw-48px)] flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-[18px] shadow-pop"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-extrabold text-ink">Date range</span>
                  <button
                    type="button"
                    onClick={clearDates}
                    className={`h-[30px] rounded-full px-2 text-[13px] font-bold text-accent hover:bg-tint ${focusRing}`}
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {presets.map((preset) => {
                    const active = draftFrom === preset.from && draftTo === preset.to;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setDraftFrom(preset.from);
                          setDraftTo(preset.to);
                        }}
                        className={`h-8 rounded-full border px-3 text-xs font-bold transition-colors ${focusRing} ${
                          active
                            ? "border-primary bg-primary text-white"
                            : "border-line bg-surface text-ink-2 hover:bg-tint"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-muted">
                    From
                    <input
                      type="date"
                      value={draftFrom}
                      max={draftTo || undefined}
                      onChange={(event) => setDraftFrom(event.target.value)}
                      className={`h-[42px] rounded-xl border border-line bg-surface px-2.5 text-[13px] text-ink ${focusRing}`}
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-bold text-muted">
                    To
                    <input
                      type="date"
                      value={draftTo}
                      min={draftFrom || undefined}
                      onChange={(event) => setDraftTo(event.target.value)}
                      className={`h-[42px] rounded-xl border border-line bg-surface px-2.5 text-[13px] text-ink ${focusRing}`}
                    />
                  </label>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDatesOpen(false)}
                    className={`h-10 flex-1 rounded-full border border-line bg-surface font-bold text-ink hover:bg-tint ${focusRing}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={applyDates}
                    className={`h-10 flex-1 rounded-full bg-primary font-bold text-white shadow-[0_8px_20px_rgba(46,111,239,0.30)] hover:bg-electric-blue-strong ${focusRing}`}
                  >
                    Apply
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div
            role="tablist"
            aria-label="Activity range"
            className="flex gap-0.5 rounded-full bg-seg p-1"
          >
            {POINT_PERIODS.map((option) => {
              const active = option === period;
              return (
                <Link
                  key={option}
                  href={chartHref(option, from, to)}
                  role="tab"
                  aria-selected={active}
                  className={`inline-flex min-h-[34px] items-center rounded-full px-3.5 text-[13px] transition-colors ${focusRing} ${
                    active
                      ? "bg-surface font-bold text-ink shadow-[0_1px_3px_rgba(21,18,31,0.12)]"
                      : "font-medium text-ink-2 hover:text-ink"
                  }`}
                >
                  {POINT_PERIOD_META[option].label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-col items-end">
            <span className="text-[26px] font-extrabold leading-none text-ink">
              {total.toLocaleString("en-US")}
            </span>
            <span className="text-xs text-muted">pts in this range</span>
          </div>
        </div>
      </div>

      {buckets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-4 py-14 text-center text-sm text-muted">
          No points in this date range. Try a wider range or clear the dates.
        </div>
      ) : (
        <div className="flex items-end gap-3 overflow-x-auto pb-0.5">
          {buckets.map((bucket, index) => {
            const value = bucket.points;
            const met = hasTarget ? value >= target : index === lastIndex;
            const over = hasTarget && value > target;
            const pct = value <= 0 ? 0 : Math.max(6, Math.round((value / max) * 100));
            return (
              <div
                key={`${bucket.label}-${index}`}
                className="flex min-w-9 flex-1 flex-col items-center gap-2"
              >
                <span className="flex min-h-[34px] flex-col items-center justify-end gap-0.5">
                  {over ? (
                    <span className="rounded-full bg-ok-bg px-1.5 py-px text-[11px] font-bold text-ok-fg">
                      +{(value - target).toLocaleString("en-US")}
                    </span>
                  ) : null}
                  <span className="text-xs font-semibold text-ink-2">
                    {value.toLocaleString("en-US")}
                  </span>
                </span>
                <div className="relative h-[180px] w-full max-w-12 overflow-hidden rounded-full bg-tint">
                  <div
                    className={`absolute inset-x-0 bottom-0 rounded-full transition-[height] duration-500 motion-reduce:transition-none ${
                      met ? "bg-primary" : "bg-sky-tint"
                    }`}
                    style={{ height: `${pct}%` }}
                  />
                  {hasTarget ? (
                    <div
                      className="absolute inset-x-0 border-t-2 border-dashed border-ink opacity-55"
                      style={{ bottom: `${targetPct}%` }}
                    />
                  ) : null}
                </div>
                <span className="whitespace-nowrap text-xs text-muted">{bucket.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
