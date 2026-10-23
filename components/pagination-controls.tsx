import Link from "next/link";
import { buildPaginationUrl, getPaginationRange } from "@/lib/pagination";

export interface PaginationControlsProps {
  page: number;
  totalPages: number;
  totalCount: number;
  from: number;
  to: number;
  queryParams: Record<string, string | undefined>;
  /** Route the page links point at. Defaults to the issues list. */
  basePath?: string;
  /** Singular noun for the "Showing 1-25 of 60 …" line. */
  itemLabel?: string;
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

const linkClass = `inline-flex h-9 min-w-9 items-center justify-center rounded-full border border-line bg-surface px-3 text-xs font-bold text-ink transition-colors hover:bg-tint ${focusRing}`;
const disabledClass =
  "inline-flex h-9 min-w-9 cursor-not-allowed items-center justify-center rounded-full border border-line bg-chip px-3 text-xs font-bold text-muted";

export function PaginationControls({
  page,
  totalPages,
  totalCount,
  from,
  to,
  queryParams,
  basePath = "/issues",
  itemLabel = "issue",
}: PaginationControlsProps) {
  if (totalCount === 0) return null;

  const range = getPaginationRange(page, totalPages);
  const prevUrl = page > 1 ? buildPaginationUrl(basePath, page - 1, queryParams) : null;
  const nextUrl =
    page < totalPages ? buildPaginationUrl(basePath, page + 1, queryParams) : null;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="text-[13px] text-muted">
        Showing <span className="font-bold text-ink">{from}</span>–
        <span className="font-bold text-ink">{to}</span> of{" "}
        <span className="font-bold text-ink">{totalCount}</span>{" "}
        {itemLabel}
        {totalCount === 1 ? "" : "s"}
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {prevUrl ? (
            <Link href={prevUrl} className={linkClass}>
              Previous
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              Previous
            </span>
          )}

          <div className="flex items-center gap-1">
            {range.map((item, index) => {
              if (item === "...") {
                return (
                  <span key={`ellipsis-${index}`} className="px-1.5 text-xs text-muted">
                    …
                  </span>
                );
              }

              const isCurrent = item === page;
              const url = buildPaginationUrl(basePath, item, queryParams);

              return isCurrent ? (
                <span
                  key={item}
                  aria-current="page"
                  className="inline-flex h-9 min-w-9 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-white"
                >
                  {item}
                </span>
              ) : (
                <Link key={item} href={url} className={linkClass}>
                  {item}
                </Link>
              );
            })}
          </div>

          {nextUrl ? (
            <Link href={nextUrl} className={linkClass}>
              Next
            </Link>
          ) : (
            <span aria-disabled="true" className={disabledClass}>
              Next
            </span>
          )}
        </div>
      )}
    </nav>
  );
}
