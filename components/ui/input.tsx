import type { InputHTMLAttributes } from "react";

export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-xs placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
      {...props}
    />
  );
}
