export const RATE_LIMIT_MESSAGE =
  "You're doing that too fast. Please wait a moment.";

export type RateLimitConfig = {
  max: number;
  windowMs: number;
};

export const ACTION_RATE_LIMITS = {
  createBug: { max: 10, windowMs: 60 * 1000 },
  addComment: { max: 20, windowMs: 60 * 1000 },
  toggleVote: { max: 60, windowMs: 60 * 1000 },
  editBug: { max: 20, windowMs: 60 * 1000 },
  editComment: { max: 30, windowMs: 60 * 1000 },
  selfAssign: { max: 15, windowMs: 60 * 1000 },
} as const;

const MINUTE = 60 * 1000;

/**
 * Limits for the sign-in, sign-up and password-reset actions (#207). Each is
 * checked twice, per email address and per client IP, so one attacker can't
 * hammer one account and can't spray many accounts from one address.
 */
export const AUTH_RATE_LIMITS = {
  login: { email: { max: 10, windowMs: 15 * MINUTE }, ip: { max: 30, windowMs: 15 * MINUTE } },
  signup: { email: { max: 3, windowMs: 60 * MINUTE }, ip: { max: 10, windowMs: 60 * MINUTE } },
  forgotPassword: { email: { max: 3, windowMs: 15 * MINUTE }, ip: { max: 10, windowMs: 15 * MINUTE } },
  resetPassword: { email: { max: 10, windowMs: 15 * MINUTE }, ip: { max: 20, windowMs: 15 * MINUTE } },
} as const;

export type AuthRateLimitAction = keyof typeof AUTH_RATE_LIMITS;

const tracker = new Map<string, number[]>();

/** Bound memory use: past this many keys, drop the ones whose window has passed. */
const MAX_TRACKED_KEYS = 10_000;
const LONGEST_WINDOW_MS = 60 * MINUTE;

function pruneExpired(now: number) {
  for (const [key, timestamps] of tracker) {
    const latest = timestamps[timestamps.length - 1] ?? 0;
    if (latest <= now - LONGEST_WINDOW_MS) tracker.delete(key);
  }
}

/**
 * Sliding window rate limiter for user actions.
 * Automatically evicts timestamps older than windowMs.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  const windowStart = now - config.windowMs;
  const timestamps = (tracker.get(key) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= config.max) {
    const oldest = timestamps[0] ?? now;
    const retryAfterMs = Math.max(0, oldest + config.windowMs - now);
    return { allowed: false, retryAfterMs };
  }

  timestamps.push(now);
  tracker.set(key, timestamps);
  if (tracker.size > MAX_TRACKED_KEYS) pruneExpired(now);
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Checks an auth action against both its per-email and per-IP limits (#207).
 * Either limit being hit blocks the attempt.
 */
export function checkAuthRateLimit(
  action: AuthRateLimitAction,
  { email, ip }: { email?: string | null; ip?: string | null },
  now = Date.now(),
): { allowed: boolean; retryAfterMs: number } {
  const limits = AUTH_RATE_LIMITS[action];
  const checks = [
    email ? checkRateLimit(`auth:${action}:email:${email.trim().toLowerCase()}`, limits.email, now) : null,
    ip ? checkRateLimit(`auth:${action}:ip:${ip}`, limits.ip, now) : null,
  ].filter((c): c is { allowed: boolean; retryAfterMs: number } => c !== null);

  const blocked = checks.filter((c) => !c.allowed);
  if (blocked.length === 0) return { allowed: true, retryAfterMs: 0 };
  return { allowed: false, retryAfterMs: Math.max(...blocked.map((c) => c.retryAfterMs)) };
}

/**
 * Best-effort client IP from proxy headers (first `x-forwarded-for` entry,
 * else `x-real-ip`). It's only used as a rate-limit key, never for access
 * decisions, so a spoofed value at worst gives an attacker their own bucket;
 * the per-email limit still applies.
 */
export function clientIpFrom(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}

/** Number of keys currently tracked (for tests). */
export function trackedKeyCount(): number {
  return tracker.size;
}

/** Reset rate limit tracker (useful for testing). */
export function resetRateLimits(): void {
  tracker.clear();
}
