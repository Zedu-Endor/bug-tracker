import type { ReactNode } from "react";

/**
 * A small rounded status/priority/stage chip in the redesign's palette.
 * `dot` adds the 5px current-colour dot used by status and stage chips.
 */
export function Pill({
  children,
  className,
  dot = false,
}: {
  children: ReactNode;
  className: string;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-xs font-bold ${className}`}
    >
      {dot ? <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
