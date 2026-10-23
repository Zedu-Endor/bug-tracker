"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { setThemeAction, setGuestThemeAction } from "@/app/actions/settings";
import { THEMES, themeAttribute, themeLabels, type Theme } from "@/lib/theme";

/** The theme the server already wrote onto `<html>`. The first client paint must use this same value. */
const ServerThemeContext = createContext<Theme>("system");

export function ThemePreference({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return <ServerThemeContext.Provider value={theme}>{children}</ServerThemeContext.Provider>;
}

/**
 * Apply theme to documentElement immediately on client, and persist to localStorage (#659).
 */
export function applyThemeClient(next: Theme) {
  const root = document.documentElement;
  const attr = themeAttribute(next);
  if (attr) {
    root.setAttribute("data-theme", attr);
  } else {
    root.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem("theme", next);
  } catch {}
}

function subscribeTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};

  let observer: MutationObserver | null = null;
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === "data-theme") {
          callback();
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  const media =
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
  const onMedia = () => callback();
  media?.addEventListener("change", onMedia);

  return () => {
    observer?.disconnect();
    media?.removeEventListener("change", onMedia);
  };
}

function getClientTheme(): Theme {
  if (typeof document === "undefined") return "system";
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" || attr === "light" ? attr : "system";
}

export function useTheme(persist: "account" | "device" = "account"): [Theme, (next: Theme) => void, boolean] {
  const serverTheme = useContext(ServerThemeContext);
  const [pending, startTransition] = useTransition();
  // The server snapshot is the theme rendered on <html>. Reading a different
  // value here (or asking the device) makes the button hydrate the other icon.
  const theme = useSyncExternalStore(subscribeTheme, getClientTheme, () => serverTheme);

  const setTheme = (next: Theme) => {
    const previous = theme;
    applyThemeClient(next);
    startTransition(async () => {
      const result =
        persist === "device"
          ? await setGuestThemeAction(next)
          : await setThemeAction(next);
      if (result.error) {
        applyThemeClient(previous);
      }
    });
  };

  return [theme, setTheme, pending];
}

export function SunIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
      />
    </svg>
  );
}

export function MoonIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
      />
    </svg>
  );
}

/**
 * Whether a system theme is currently dark. Starts false so the first paint
 * matches the server; the device setting is applied after hydration.
 */
function usePrefersDark(): boolean {
  const [prefersDark, setPrefersDark] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setPrefersDark(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return prefersDark;
}

/**
 * Navbar Dark Mode Toggle button (#659).
 * Switches directly between light and dark themes on click with instant client update.
 */
export function ThemeToggle({
  className = "",
  persist = "account",
}: {
  className?: string;
  /** "device" is for signed-out pages: the choice goes to this browser only. */
  persist?: "account" | "device";
}) {
  const [theme, setTheme, pending] = useTheme(persist);
  const prefersDark = usePrefersDark();
  const isDark = theme === "dark" || (theme === "system" && prefersDark);

  const toggle = () => {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
  };

  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink transition-colors hover:bg-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${className}`}
    >
      {isDark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
    </button>
  );
}

const THEME_ICONS: Record<Theme, string> = {
  system: "M3 4h18v12H3zM8 20h8M12 16v4",
  light:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  dark: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z",
};

/**
 * The account menu's theme switch (#659): a segmented control of System,
 * Light and Dark, as in the redesign's avatar menu.
 */
export function AccountThemeSelector() {
  const [theme, setTheme, pending] = useTheme();

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5" role="group" aria-label="Theme preference">
      <span aria-hidden="true" className="text-xs font-bold uppercase tracking-[0.06em] text-muted">
        Theme
      </span>
      <div className="grid grid-cols-3 gap-0.5 rounded-xl bg-seg p-1">
        {THEMES.map((opt) => (
          <button
            key={opt}
            type="button"
            disabled={pending}
            onClick={() => setTheme(opt)}
            aria-pressed={theme === opt}
            className={`flex h-[34px] items-center justify-center gap-1.5 rounded-[9px] text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              theme === opt
                ? "bg-surface font-bold text-ink shadow-[0_1px_3px_rgba(21,18,31,0.14)]"
                : "font-medium text-ink-2 hover:text-ink"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={THEME_ICONS[opt]} />
            </svg>
            {themeLabels[opt]}
          </button>
        ))}
      </div>
    </div>
  );
}
