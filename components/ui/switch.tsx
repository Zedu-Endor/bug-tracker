"use client";

/**
 * The pill switch used in Settings (#287, #277). A button with role="switch"
 * rather than a styled checkbox, so it matches the redesign while keeping
 * `aria-checked` and the keyboard/space behaviour people expect.
 */
export function Switch({
  id,
  checked,
  disabled,
  label,
  describedBy,
  onChange,
}: {
  id: string;
  checked: boolean;
  disabled?: boolean;
  label: string;
  describedBy?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-[46px] shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-primary" : "bg-chip-2"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-[left] ${
          checked ? "left-[21px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}
