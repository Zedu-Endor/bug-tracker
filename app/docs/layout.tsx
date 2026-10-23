import Link from "next/link";
import { auth } from "@/auth";
import { MAIN_CONTENT_ID, SkipLink } from "@/components/skip-link";

/**
 * #631: `/docs` is reference material for prospective developers and their
 * agents, who are by definition not signed in, so it lives outside the `(app)`
 * group whose layout calls `requireUser()`. This shell gives the page public
 * chrome instead of the signed-in header — and it reads no workspace data.
 */
export default async function PublicDocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const signedIn = !!session?.user;

  return (
    <div className="flex min-h-screen flex-col bg-zk-bg">
      <SkipLink />
      <header className="sticky top-0 z-50 border-b border-zk-border bg-zk-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="text-base font-extrabold tracking-tight text-zk-text"
          >
            Ziki Issues
          </Link>
          <nav
            className="flex items-center gap-3 sm:gap-4"
            aria-label="Documentation"
          >
            <a
              href="/llms.txt"
              className="text-sm font-medium text-zk-muted transition-colors hover:text-zk-text"
            >
              /llms.txt
            </a>
            <Link
              href={signedIn ? "/issues" : "/login"}
              className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
            >
              {signedIn ? "Open issues" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>
      <main
        id={MAIN_CONTENT_ID}
        /* Focusable so the skip link can move focus here; -1 keeps it out of
           the normal tab order. */
        tabIndex={-1}
        className="outline-none mx-auto w-full max-w-7xl flex-1 px-3.5 pt-5 pb-10 sm:px-4 sm:pt-8"
      >
        {children}
      </main>
    </div>
  );
}
