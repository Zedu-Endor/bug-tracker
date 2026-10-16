"use client";

import { usePathname } from "next/navigation";

/**
 * Floating "Report issue" button that links out to the external reporting form
 * (see `REPORT_FORM_URL` in `.env.example`). Renders nothing when the URL is
 * not configured, and is suppressed on the in-app report form where it would
 * compete with the real form.
 *
 * The URL is resolved and validated server-side (see `lib/report-form.ts`) and
 * passed in as a prop, so no secret-looking config is inlined client-side.
 */
export function ReportIssueFab({ href }: { href?: string }) {
  const pathname = usePathname();

  if (!href) return null;
  if (pathname?.endsWith("/bugs/new")) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 sm:right-6 sm:bottom-6"
    >
      <svg
        viewBox="0 0 16 16"
        width="16"
        height="16"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M14.5 2.5v3.2c0 1.7-2 3.1-4.6 3.3-1 .1-2 .2-2.4.6-.3.3-.5.8-.5 1.4v1.4" />
        <path d="M14.5 2.5 7.9 7.8a.8.8 0 0 1-1 .1L3.6 5.6c-.5-.3-.5-1 0-1.3l1.8-1.6h6.5c1.4 0 2.6 0 2.6 0Z" />
        <path d="M7.5 9.6 6 14a.6.6 0 0 1-1.1.2L3.2 12" />
      </svg>
      <span>Report issue</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}