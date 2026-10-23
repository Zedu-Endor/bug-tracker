"use client";

import { useState, useTransition } from "react";
import { setThemeAction } from "@/app/actions/settings";
import { THEMES, themeAttribute, themeDescriptions, themeLabels, type Theme } from "@/lib/theme";

/** Shows a choice on this page at once, before the server has saved it, and syncs localStorage (#659). */
function showTheme(theme: Theme) {
  const root = document.documentElement;
  const attr = themeAttribute(theme);
  if (attr) root.setAttribute("data-theme", attr);
  else root.removeAttribute("data-theme");
  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

/** The little window sketched inside each theme card. */
const previews: Record<Theme, { background: string; bar: string; line: string }> = {
  system: {
    background: "linear-gradient(90deg, #FFFFFF 50%, #0E1A33 50%)",
    bar: "#3978F6",
    line: "#8FA3C4",
  },
  light: { background: "#FFFFFF", bar: "#3978F6", line: "#E3E8F2" },
  dark: { background: "#0E1A33", bar: "#3978F6", line: "#22324F" },
};

/** Settings → Appearance (#277): System / Light / Dark. */
export function ThemeSettings({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const apply = (next: Theme) => {
    const previous = theme;
    setTheme(next);
    setMessage(null);
    // Straight away on this page; the server renders it from now on.
    showTheme(next);
    startTransition(async () => {
      const result = await setThemeAction(next);
      if (result.error) {
        setTheme(previous);
        showTheme(previous);
        setMessage(result.error);
      } else {
        setMessage(`Appearance set to ${themeLabels[next].toLowerCase()}.`);
      }
    });
  };

  return (
    <fieldset className="min-w-0" disabled={pending}>
      <legend className="sr-only">Appearance</legend>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]"
      >
        {THEMES.map((option) => {
          const current = theme === option;
          const preview = previews[option];
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={current}
              onClick={() => apply(option)}
              className={`flex flex-col gap-3 rounded-2xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                current
                  ? "border-2 border-primary bg-row-sel"
                  : "m-px border border-line bg-surface hover:bg-tint"
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-[72px] w-full flex-col gap-1.5 rounded-[10px] border border-line p-2.5"
                style={{ background: preview.background }}
              >
                <span
                  className="h-2 w-2/5 rounded-full"
                  style={{ background: preview.bar }}
                />
                <span
                  className="h-1.5 w-4/5 rounded-full"
                  style={{ background: preview.line }}
                />
                <span
                  className="h-1.5 w-3/5 rounded-full"
                  style={{ background: preview.line }}
                />
              </span>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-bold text-ink">{themeLabels[option]}</span>
                  <span className="text-xs text-muted">{themeDescriptions[option]}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`h-[18px] w-[18px] shrink-0 rounded-full ${
                    current
                      ? "border-[5px] border-primary bg-white"
                      : "border-2 border-line"
                  }`}
                />
              </span>
            </button>
          );
        })}
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-ok-fg empty:hidden">
        {message ?? ""}
      </p>
    </fieldset>
  );
}
