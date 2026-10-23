"use client";

import { useState, useTransition } from "react";
import { setKeyboardShortcutsAction } from "@/app/actions/settings";
import { ShowShortcutsButton } from "@/components/keyboard-shortcuts";
import { Switch } from "@/components/ui/switch";

const examples = [
  { keys: ["?"], label: "Show shortcuts" },
  { keys: ["/"], label: "Search issues" },
  { keys: ["N"], label: "Report an issue" },
  { keys: ["G", "I"], label: "Go to issues" },
];

/** Settings → Keyboard shortcuts (#287): the off switch and the cheat sheet. */
export function KeyboardShortcutSettings({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-bold text-ink">Keyboard shortcuts</h2>
          <p className="text-[13px] leading-relaxed text-muted">
            Press{" "}
            <kbd className="rounded-md border border-line bg-chip px-1.5 py-0.5 font-[inherit] text-xs font-bold text-ink">
              ?
            </kbd>{" "}
            anywhere to see them. They never fire while you&apos;re typing.
          </p>
        </div>
        <Switch
          id="keyboard-shortcuts"
          checked={enabled}
          disabled={pending}
          label="Use keyboard shortcuts"
          describedBy="keyboard-shortcuts-help"
          onChange={(next) => {
            setEnabled(next);
            setMessage(null);
            startTransition(async () => {
              const result = await setKeyboardShortcutsAction(next);
              if (result.error) {
                setEnabled(!next);
                setMessage(result.error);
              } else {
                setMessage(next ? "Keyboard shortcuts turned on." : "Keyboard shortcuts turned off.");
              }
            });
          }}
        />
      </div>
      <span id="keyboard-shortcuts-help" className="sr-only">
        Turn keyboard shortcuts on or off. They never fire while you are typing.
      </span>

      <div className="flex flex-wrap gap-2">
        {examples.map((example) => (
          <span
            key={example.label}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-chip px-2.5 py-1.5 text-xs text-ink-2"
          >
            {example.keys.map((key) => (
              <kbd
                key={key}
                className="min-w-[18px] rounded-md border border-line bg-surface px-1.5 py-0.5 text-center font-[inherit] text-xs font-extrabold text-ink"
              >
                {key}
              </kbd>
            ))}
            {example.label}
          </span>
        ))}
      </div>

      <ShowShortcutsButton />

      <p role="status" aria-live="polite" className="text-sm font-semibold text-ok-fg empty:hidden">
        {message ?? ""}
      </p>
    </div>
  );
}
