import type { SelectHTMLAttributes } from "react";

export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}
