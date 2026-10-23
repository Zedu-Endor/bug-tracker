import { forwardRef, type TextareaHTMLAttributes } from "react";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-xs placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${className}`}
      {...props}
    />
  );
});
