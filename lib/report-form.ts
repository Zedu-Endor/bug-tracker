/**
 * Resolves the URL of the external "report an issue" form (a Google Form) that
 * the floating report button links to.
 *
 * Configured through `REPORT_FORM_URL` so the destination can change per
 * environment without a code change. When the value is missing or not a
 * Google-hosted https URL the button is not rendered at all.
 */

import { cleanEnv } from "@/lib/env-clean";

const GOOGLE_HOSTS = new Set(["forms.gle", "docs.google.com", "www.google.com"]);

function isGoogleFormUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (GOOGLE_HOSTS.has(parsed.hostname.toLowerCase())) return true;
  // `*.google.com` subdomains (e.g. regional forms hosts) are allowed too.
  return parsed.hostname.toLowerCase().endsWith(".google.com");
}

/** Valid form URL, or `undefined` when unset/invalid. */
export function resolveReportFormUrl(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): string | undefined {
  const raw = cleanEnv(env.REPORT_FORM_URL);
  if (!raw) return undefined;
  return isGoogleFormUrl(raw) ? raw : undefined;
}

export const REPORT_FORM_URL = resolveReportFormUrl();