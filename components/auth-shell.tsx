import Link from "next/link";
import type { ReactNode } from "react";
import { ZikiWordmark } from "@/components/brand-lockup";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The one-card shell behind the password-recovery and invite pages, so they
 * match the sign-in screen without repeating its brand panel.
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
        <ThemeToggle persist="device" />
      </div>

      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-7 shadow-[0_30px_70px_rgba(11,23,51,0.10)] sm:p-9">
        <Link
          href="/"
          aria-label="Ziki home"
          className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-[#0B1733]">
            <ZikiWordmark collapsed />
          </span>
          <span className="text-2xl font-extrabold tracking-tight text-ink">Ziki</span>
        </Link>

        <h1 className="mt-5 text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p>
        ) : null}

        <div className="mt-6">{children}</div>

        {footer ? <div className="mt-6 text-center text-sm text-muted">{footer}</div> : null}
      </div>
    </main>
  );
}
