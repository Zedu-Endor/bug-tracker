import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-secondary";

const variants: Record<Variant, string> = {
  primary:
    "bg-primary text-white hover:bg-electric-blue-strong focus-visible:ring-primary",
  secondary:
    "bg-surface text-ink border border-line hover:bg-tint focus-visible:ring-primary",
  ghost: "bg-transparent text-ink-2 hover:bg-chip",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600",
  "danger-secondary":
    "bg-surface text-bad-fg border border-bad-bd hover:bg-bad-soft focus-visible:ring-bad-bd",
};

export function Button({
  children,
  className = "",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full px-3.5 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
