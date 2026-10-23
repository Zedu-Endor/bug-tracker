import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { isAgentPlatformEnabled } from "@/lib/feature-flags";
import { WebhookManagement } from "@/components/webhook-management";

export const metadata = { title: "Webhooks" };

const CARD = "flex flex-col gap-3.5 rounded-[20px] border border-line bg-surface p-[22px]";

function BackLink() {
  return (
    <Link
      href="/settings"
      className="inline-flex min-h-8 items-center gap-1.5 self-start text-sm font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
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
      Back to settings
    </Link>
  );
}

function ExternalIcon() {
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
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}

export default async function WebhooksSettingsPage() {
  if (!isAgentPlatformEnabled()) {
    return (
      <div className="flex flex-col gap-5">
        <BackLink />
        <div className="flex max-w-[680px] flex-col gap-1.5">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
            Webhooks
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            The agent platform feature is not enabled in this environment.
          </p>
        </div>
      </div>
    );
  }

  await requireUser();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <BackLink />
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-[680px] flex-col gap-1.5">
            <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-ink">
              Webhooks
            </h1>
            <p className="text-sm leading-relaxed text-muted">
              Manage webhook subscriptions for your agents. Events are delivered to each
              subscription&rsquo;s HTTPS endpoint with HMAC-SHA256 signatures.
            </p>
          </div>
          <Link
            href="/docs"
            className="inline-flex h-[42px] items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Webhook docs
            <ExternalIcon />
          </Link>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <WebhookManagement />
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <section className={CARD}>
            <h2 className="text-base font-bold text-ink">How delivery works</h2>
            <ol className="flex flex-col gap-3.5">
              {[
                {
                  title: "Pick an agent",
                  body: "Each subscription belongs to one of your agents and receives that agent’s events.",
                },
                {
                  title: "Add your HTTPS endpoint",
                  body: "Ziki POSTs each event to the URL you enter. Only HTTPS is accepted.",
                },
                {
                  title: "Verify every delivery",
                  body: "Requests are signed with HMAC-SHA256 using the subscription’s signing secret.",
                },
              ].map((step, index) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-tint text-[13px] font-extrabold text-accent"
                  >
                    {index + 1}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-bold text-ink">{step.title}</span>
                    <span className="text-[13px] leading-relaxed text-ink-2">{step.body}</span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-col gap-2.5 rounded-[20px] bg-[#0B1733] p-5 text-[#DCE5F5]">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-[#A9BCDF]">
              Verify a signature
            </span>
            <pre className="m-0 overflow-x-auto font-mono text-xs leading-[1.7] text-[#DCE5F5]">
              {`expected = hmac_sha256(
  secret, raw_request_body
)
if !timing_safe_equal(
  expected, signature_header
):
  reject(401)`}
            </pre>
            <span className="text-xs leading-relaxed text-[#A9BCDF]">
              Header name and payload format: see the{" "}
              <Link href="/docs" className="font-semibold text-white underline">
                webhook docs
              </Link>
              .
            </span>
          </section>
        </aside>
      </div>
    </div>
  );
}
