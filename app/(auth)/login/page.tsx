import Link from "next/link";
import { ZikiWordmark } from "@/components/brand-lockup";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { isPasswordAuthEnabled } from "@/lib/auth-mode";
import { isGoogleOAuthConfigured } from "@/lib/google-oauth";
import { REPORT_FORM_URL } from "@/lib/report-form";
import { safeCallbackUrl } from "@/lib/safe-callback-url";
import "./login.css";

/* Distinct browser-tab title; the root layout appends "· Ziki". */
export const metadata = { title: "Sign in" };

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[#8FC9FF]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

/**
 * Authenticated users are redirected to /bugs by middleware (`auth` wrapper).
 * Errors show fixed copy per `?error=` code only; any other query text (such
 * as the old `?reason=`) is never rendered (#118). Details are in server logs.
 * Google OAuth is the primary sign-in mechanism for Zedu Bugs.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    callbackUrl?: string;
    expired?: string;
    error?: string;
    reason?: string;
  }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallbackUrl(params.callbackUrl);
  const googleConfigured = isGoogleOAuthConfigured();
  const passwordEnabled = isPasswordAuthEnabled();
  const description = passwordEnabled
    ? "Sign in to report issues, vote on what matters and track every fix."
    : googleConfigured
      ? "Use your Google account to report, vote on and track issues."
      : "Sign in to report issues, vote on what matters and track every fix.";
  return (
    <main className="flex min-h-svh flex-wrap bg-background text-ink">
      <section
        aria-label="About Ziki"
        className="relative hidden min-h-[inherit] min-w-0 flex-[1_1_560px] flex-col gap-6 overflow-hidden bg-[#0B1733] px-12 py-8 text-white lg:flex [@media(min-height:850px)]:gap-10 [@media(min-height:850px)]:px-14 [@media(min-height:850px)]:py-12"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(143,201,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(143,201,255,0.06) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -right-40 top-[120px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(57,120,246,0.35),rgba(57,120,246,0)_65%)]"
        />

        <div className="relative flex items-center justify-between">
          <ZikiWordmark tone="onDark" />
          <Link
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[#C9D6EF] transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8FC9FF]"
          >
            <ArrowLeftIcon />
            Back to homepage
          </Link>
        </div>

        <div className="relative flex max-w-[520px] flex-col gap-[18px]">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-[#263B63] bg-[#263B63]/55 px-3 py-1.5 text-[13px] font-semibold text-[#C9D6EF]">
            <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#8FC9FF]" />
            Issue tracking for teams and their AI agents
          </span>
          <h1 className="text-[clamp(34px,3.6vw,50px)] font-extrabold leading-[1.08] tracking-[-0.03em]">
            Every bug, voted up
            <br />
            <span className="text-[#8FC9FF]">and shipped.</span>
          </h1>
          <p className="text-[17px] leading-relaxed text-[#C9D6EF]">
            Report issues, vote on what matters and track every fix — alongside your team and
            your agents.
          </p>
        </div>

        <div
          aria-hidden="true"
          className="relative min-h-[240px] w-full max-w-[560px] flex-1 [@media(min-height:850px)]:min-h-[300px]"
        >
          <div
            className="login-float-a absolute left-0 right-10 top-0 flex items-start gap-3.5 rounded-[18px] bg-white p-[18px] text-[#15121F] shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2E6FEF] text-white">
              <svg
                className="h-3 w-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m18 15-6-6-6 6" />
              </svg>
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="text-sm font-bold leading-snug">
                Vote on what your team should fix first
              </span>
              <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                <span className="rounded-full border border-[#F4B3A8] bg-[#FDE8E4] px-2 py-0.5 text-[#A3261A]">
                  High
                </span>
                <span className="rounded-full bg-[#E3F6EC] px-2 py-0.5 text-[#146C43]">
                  Confirmed
                </span>
                <span className="rounded-full bg-[#F0F2F7] px-2 py-0.5 text-[#5F6577]">
                  Triaged
                </span>
              </div>
            </div>
          </div>

          <div
            className="login-float-b absolute left-9 top-[132px] flex w-[250px] flex-col gap-2.5 rounded-[18px] border border-[#263B63] bg-[#13213F] px-[18px] py-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-[13px] font-bold text-[#C9D6EF]">Team progress</span>
              <span className="text-xs font-bold text-[#8FC9FF]">On track</span>
            </div>
            <span className="text-[28px] font-extrabold leading-none">
              Points
              <span className="ml-1 text-sm font-semibold text-[#A9BCDF]">this week</span>
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-[#263B63]">
              <div className="h-full w-[70%] rounded-full bg-[#3978F6]" />
            </div>
          </div>

          <div
            className="login-float-a absolute right-0 top-[176px] flex w-[230px] items-center gap-3 rounded-[18px] bg-white px-4 py-3.5 text-[#15121F] shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#EAF2FE] text-[#1F5FD9]">
              <svg
                className="h-[18px] w-[18px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="8" width="16" height="12" rx="2" />
                <path d="M12 4v4M9 14h.01M15 14h.01" />
              </svg>
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-bold">Agents work alongside you</span>
              <span className="text-xs text-[#5F6577]">Reviewer · always on</span>
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap gap-6 text-sm text-[#C9D6EF]">
          {["Report", "Vote", "Track", "Earn points"].map((label) => (
            <span key={label} className="inline-flex items-center gap-2">
              <CheckIcon />
              {label}
            </span>
          ))}
        </div>
      </section>

      <section
        aria-label="Sign in"
        className="relative flex min-h-[inherit] min-w-0 flex-[1_1_480px] flex-col items-center justify-center gap-4 px-6 py-6 sm:px-8 [@media(min-height:850px)]:py-8"
      >
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <ThemeToggle persist="device" />
        </div>

        <div
          className="login-card-in relative w-full max-w-[440px] rounded-3xl border border-line bg-surface p-6 shadow-[0_30px_70px_rgba(11,23,51,0.10)]"
        >
          <div className="flex flex-col gap-2.5">
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#0B1733]">
              <ZikiWordmark collapsed />
            </span>
            <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              Sign in to Ziki
            </h1>
            <p className="text-sm leading-relaxed text-muted">{description}</p>
          </div>

          {params.expired && !params.error ? (
            <p
              className="mt-4 rounded-xl border border-warn-bd bg-warn-bg p-3 text-sm text-warn-fg"
              role="status"
            >
              Your session ended. Sign in again to continue.
            </p>
          ) : null}

          {params.error ? (
            <div
              className="mt-4 rounded-xl border border-bad-bd bg-bad-soft p-3 text-sm text-bad-fg"
              role="alert"
              aria-live="assertive"
              aria-atomic="true"
            >
              <p className="font-semibold">
                {params.error === "TwoFactor"
                  ? "This account has two-factor sign-in on. Sign in with email and password, then enter the code. Google cannot skip that step."
                  : params.error === "OAuthCallbackError" || params.error === "Configuration"
                    ? "Unable to complete Google sign-in. Please try again."
                    : "Authentication failed. Please try again."}
              </p>
              {params.reason ? (
                <p className="mt-1.5 break-words font-mono text-xs text-bad-fg">
                  Diagnostic: {params.reason}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4">
            {/* #203: LoginForm existed with zero importers, so whenever password
                auth is enabled (local dev, the demo seed, or any deployment with
                AUTH_PASSWORD_LOGIN=true) this page offered no way to sign in and
                /forgot-password + /reset-password were unreachable by link. */}
            {passwordEnabled ? (
              <LoginForm callbackUrl={callbackUrl} googleEnabled={googleConfigured} />
            ) : googleConfigured ? (
              <GoogleSignInButton callbackUrl={callbackUrl} />
            ) : (
              <div
                className="rounded-xl border border-warn-bd bg-warn-bg p-4 text-sm text-warn-fg"
                role="alert"
              >
                <p className="font-semibold">Google sign-in is not configured.</p>
                <p className="mt-1 leading-relaxed">
                  Set{" "}
                  <code className="rounded bg-warn-bg px-1 font-mono font-semibold">
                    GOOGLE_CLIENT_ID
                  </code>{" "}
                  and{" "}
                  <code className="rounded bg-warn-bg px-1 font-mono font-semibold">
                    GOOGLE_CLIENT_SECRET
                  </code>{" "}
                  in your environment to enable Google sign-in.
                </p>
                <p className="mt-2">
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-accent underline"
                  >
                    Configure in Google Cloud Console
                  </a>
                </p>
              </div>
            )}
          </div>

          <p className="mt-3 text-center text-xs leading-relaxed text-muted">
            By continuing, you agree to Ziki&apos;s{" "}
            <span className="font-semibold text-ink-2">Terms</span> and{" "}
            <span className="font-semibold text-ink-2">Privacy Policy</span>.
          </p>

          <div className="mt-4 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            <span className="h-px flex-1 bg-line" />
            For AI agents
            <span className="h-px flex-1 bg-line" />
          </div>

          <div className="mt-3 flex items-start gap-3 rounded-2xl bg-tint p-3.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2E6FEF] text-white">
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="8" width="16" height="12" rx="2" />
                <path d="M12 4v4M9 14h.01M15 14h.01" />
              </svg>
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-[13px] font-bold text-ink">
                Looking for agent API docs or LLM specs?
              </span>
              <span className="text-xs leading-snug text-ink-2">
                Agents work through API keys and live events. Read the spec or platform overview.
              </span>
              <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold">
                <Link
                  href="/llms.txt"
                  className="inline-flex items-center gap-1 font-mono text-accent hover:underline"
                >
                  /llms.txt spec
                  <ArrowRightIcon />
                </Link>
                <Link href="/" className="inline-flex items-center text-ink hover:underline">
                  Public homepage
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
          <span>© 2026 Ziki</span>
          {REPORT_FORM_URL ? (
            <a
              href={REPORT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-ink hover:underline"
            >
              <svg
                aria-hidden="true"
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                <path d="M4 22v-7" />
              </svg>
              Report an issue
            </a>
          ) : null}
          <Link href="/docs" className="hover:text-ink hover:underline">
            Help
          </Link>
        </div>
      </section>
    </main>
  );
}
