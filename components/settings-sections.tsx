"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type SettingsSectionMeta = {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
};

/**
 * Settings → the left section nav from the redesign.
 *
 * Every panel is kept mounted and hidden rather than unmounted, so switching
 * away from a half-typed wallet address or password does not throw it away.
 * Sections are deep-linkable with #account, #preferences, #agents, #data.
 */
export function SettingsSections({
  sections,
  initialSection,
  children,
}: {
  sections: SettingsSectionMeta[];
  /** Deep link from /settings?section=agents (the tab wins over the hash). */
  initialSection?: string;
  children: ReactNode;
}) {
  const ids = sections.map((section) => section.id);
  const idsKey = ids.join(",");
  const [active, setActive] = useState(
    initialSection && ids.includes(initialSection) ? initialSection : (ids[0] ?? ""),
  );

  // Honour a link that arrives as /settings#preferences.
  useEffect(() => {
    const valid = idsKey ? idsKey.split(",") : [];
    const sync = () => {
      const fromHash = window.location.hash.replace(/^#/, "");
      if (valid.includes(fromHash)) setActive(fromHash);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [idsKey]);

  function select(id: string) {
    setActive(id);
    // replaceState keeps the back button on the previous page, not on every
    // section someone glanced at. It also leaves the viewport in place.
    window.history.replaceState(null, "", `#${id}`);
  }

  const panels = Children.toArray(children).map((child, index) => {
    const id = isValidElement<{ "data-settings-section"?: string }>(child)
      ? child.props["data-settings-section"]
      : undefined;
    return { key: id ?? `panel-${index}`, id, child };
  });

  return (
    <div className="flex flex-wrap items-start gap-4 lg:gap-6">
      <nav
        aria-label="Settings sections"
        className="flex min-w-0 max-w-full flex-[1_1_240px] flex-col gap-1 rounded-[20px] border border-line bg-surface p-2.5"
      >
        {sections.map((section) => {
          const current = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              aria-current={current ? "page" : undefined}
              onClick={() => select(section.id)}
              className={`flex w-full items-center gap-3 rounded-[14px] p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                current ? "bg-tint" : "hover:bg-chip"
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
                  current ? "bg-primary text-white" : "bg-chip text-ink-2"
                }`}
              >
                {section.icon}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-bold text-ink">{section.label}</span>
                <span className="text-xs font-medium text-muted">{section.hint}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        {panels.map((panel) => (
          <div key={panel.key} hidden={panel.id !== active}>
            {panel.child}
          </div>
        ))}
      </div>
    </div>
  );
}
