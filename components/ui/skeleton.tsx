/**
 * Placeholder blocks for loading.tsx files (#291). The pulse is motion-safe:
 * with reduced motion requested the blocks simply sit still.
 */
export function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-chip motion-safe:animate-pulse ${className}`} />;
}

/** Wraps a skeleton so it is announced once, as "Loading…", and no more. */
export function SkeletonPage({
  label = "Loading…",
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-6">
        {children}
      </div>
    </div>
  );
}

/** A card-shaped block, the common shape across the app's pages. */
export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-[20px] border border-line bg-surface p-4 sm:p-6">
      <Bar className="h-3 w-28" />
      {Array.from({ length: rows }, (_, i) => (
        <Bar key={i} className={`h-4 ${i % 2 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}
