/**
 * How many sweep runs each cron caller gets per minute, mirroring the webhook
 * dispatcher's knob (#679). The sweeps themselves skip a run that is already
 * in progress inside `lib/cron/runner.ts`, so this is a hard abuse bound for
 * a runaway or leaked-`CRON_SECRET` scheduler, not a correctness gate: Vercel
 * Cron (GET) and an external scheduler (POST) stay on separate per-caller
 * buckets. `INTERNAL_CRON_MAX_PER_MINUTE` raises or lowers it (1 to 60).
 */
export const INTERNAL_CRON_RUNS_PER_MINUTE = 6;
const MAX_INTERNAL_CRON_RUNS_PER_MINUTE = 60;

export function internalCronRunsPerMinute(raw = process.env.INTERNAL_CRON_MAX_PER_MINUTE): number {
  const value = Number(raw?.trim());
  if (!raw?.trim() || !Number.isInteger(value) || value < 1) return INTERNAL_CRON_RUNS_PER_MINUTE;
  return Math.min(value, MAX_INTERNAL_CRON_RUNS_PER_MINUTE);
}
