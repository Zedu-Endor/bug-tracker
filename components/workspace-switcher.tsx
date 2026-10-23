"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { selectTenantAction } from "@/app/(app)/tenants/actions";

/** A workspace the viewer belongs to and can open from the header. */
export type WorkspaceChoice = {
  id: string;
  name: string;
  slug: string;
};

function visibleName(workspace: WorkspaceChoice, shared: boolean): string {
  return shared ? `${workspace.name} (${workspace.slug})` : workspace.name;
}

/**
 * The active workspace in the header. The closed control is only as wide as
 * the current name. Choosing another one submits selectTenantAction, the same
 * switch the workspaces page uses. The accessible name includes the workspace
 * name on screen (WCAG 2.5.3); there is no aria-label to replace it.
 */
export function WorkspaceSwitcher({
  workspaces,
  activeTenantId,
  className = "",
  fullWidth = false,
  tone = "default",
}: {
  workspaces: WorkspaceChoice[];
  activeTenantId: string | null;
  className?: string;
  fullWidth?: boolean;
  /**
   * "chrome" paints the control for navy chrome; "sidebar" is the redesign's
   * full-width workspace card at the top of the app sidebar.
   */
  tone?: "default" | "chrome" | "sidebar";
}) {
  const sidebar = tone === "sidebar";
  const chrome = tone === "chrome" || sidebar;
  const listId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const counts = new Map<string, number>();
  for (const workspace of workspaces) {
    const key = workspace.name.toLocaleLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const shared = (name: string) => (counts.get(name.toLocaleLowerCase()) ?? 0) > 1;
  const selected =
    workspaces.find((workspace) => workspace.id === activeTenantId) ?? workspaces[0];

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!selected) {
    return (
      <Link
        href="/tenants"
        className={`inline-flex items-center px-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
          sidebar
            ? "min-h-12 rounded-[14px] border border-sidebar-line bg-sidebar-card px-3 text-sm text-white hover:bg-[#2d4572] focus-visible:ring-sky-tint focus-visible:ring-offset-deep-ocean"
            : chrome
              ? "h-8 rounded-lg border border-surface-border bg-[#132347] text-xs text-porcelain hover:bg-[#1a2d57]"
              : "h-8 rounded-lg text-xs text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        } ${fullWidth || sidebar ? "w-full" : ""} ${className}`}
      >
        Workspaces
      </Link>
    );
  }

  const selectedLabel = visibleName(selected, shared(selected.name));

  function choose(id: string) {
    setOpen(false);
    if (id === selected?.id) return;
    const form = formRef.current;
    const input = form?.elements.namedItem("tenantId");
    if (!form || !(input instanceof HTMLInputElement)) return;
    input.value = id;
    form.requestSubmit();
  }

  return (
    <div ref={rootRef} className={`relative ${fullWidth || sidebar ? "w-full" : "w-max max-w-40"} ${className}`}>
      <form ref={formRef} action={selectTenantAction}>
        <input type="hidden" name="tenantId" defaultValue={selected.id} />
        {sidebar ? (
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((current) => !current)}
            className="flex min-h-12 w-full items-center gap-2.5 rounded-[14px] border border-sidebar-line bg-sidebar-card px-3 py-2 text-left text-white transition-colors hover:bg-[#2d4572] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-tint focus-visible:ring-offset-2 focus-visible:ring-offset-deep-ocean"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-extrabold text-primary"
            >
              {selected.name.trim().slice(0, 2) || "?"}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span aria-hidden="true" className="text-[11px] text-sidebar-muted">
                Workspace
              </span>
              <span className="truncate font-bold">
                <span className="sr-only">Active workspace, </span>
                {selectedLabel}
              </span>
            </span>
            <svg className="h-4 w-4 shrink-0 text-sidebar-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m7 15 5 5 5-5M7 9l5-5 5 5" />
            </svg>
          </button>
        ) : (
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((current) => !current)}
          className={`inline-flex h-9 max-w-full items-center gap-2 rounded-full border py-0 pl-3 pr-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 ${
            chrome
              ? "border-surface-border bg-white/[0.04] text-sm text-porcelain hover:bg-white/[0.08]"
              : "border-slate-200 bg-card text-xs text-slate-800 hover:bg-slate-50"
          } ${fullWidth ? "w-full justify-between" : ""}`}
        >
          <span className="sr-only">Active workspace, </span>
          {chrome ? (
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          ) : null}
          <span className="truncate">{selectedLabel}</span>
          <svg className={`h-3.5 w-3.5 shrink-0 ${chrome ? "text-sky-tint/70" : "text-slate-400"}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        )}
        {open ? (
          <ul
            id={listId}
            role="listbox"
            aria-label="Workspaces"
            className={`absolute left-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border p-1 shadow-sm ${
              chrome ? "border-surface-border bg-[#142343]" : "border-slate-200 bg-card"
            } ${fullWidth || sidebar ? "w-full" : "w-max min-w-full max-w-56"}`}
          >
            {workspaces.map((workspace) => {
              const label = visibleName(workspace, shared(workspace.name));
              const current = workspace.id === selected.id;
              return (
                <li key={workspace.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={current}
                    onClick={() => choose(workspace.id)}
                    className={`block w-full truncate rounded-md px-2 py-1.5 text-left text-xs ${
                      current
                        ? chrome
                          ? "bg-electric-blue/20 font-medium text-white"
                          : "bg-teal-50 font-medium text-teal-900"
                        : chrome
                          ? "text-slate-200 hover:bg-white/5"
                          : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </form>
    </div>
  );
}
