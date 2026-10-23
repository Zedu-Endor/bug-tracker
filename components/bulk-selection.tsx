"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { bulkUpdateBugsAction } from "@/app/actions/issues-bulk";
import { MAX_BULK_IDS } from "@/lib/bulk-actions";
import { severities, statuses } from "@/lib/validations/issue";
import { severityLabel, statusLabel } from "@/lib/labels";

type Selection = {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  isSelected: (id: string) => boolean;
};

const SelectionContext = createContext<Selection | null>(null);

function useSelection(): Selection | null {
  return useContext(SelectionContext);
}

type Option = { id: string; name: string };

export function BulkSelectionProvider({
  pageIds,
  types,
  platforms,
  users,
  children,
}: {
  /** Ids on the page being shown, for "select all". */
  pageIds: string[];
  types: Option[];
  platforms: Option[];
  users: Option[];
  children: React.ReactNode;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const value = useMemo<Selection>(
    () => ({ selected, toggle, isSelected: (id) => selected.has(id) }),
    [selected, toggle],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
      <BulkBar
        selected={selected}
        setSelected={setSelected}
        pageIds={pageIds}
        types={types}
        platforms={platforms}
        users={users}
      />
    </SelectionContext.Provider>
  );
}

/** The checkbox on one row. Renders nothing outside a provider. */
export function BulkCheckbox({ id, title }: { id: string; title: string }) {
  const selection = useSelection();
  if (!selection) return null;
  return (
    <input
      type="checkbox"
      checked={selection.isSelected(id)}
      onChange={() => selection.toggle(id)}
      aria-label={`Select ${title}`}
      className="h-4 w-4 shrink-0 rounded border-line text-primary accent-primary focus:ring-primary"
    />
  );
}

const selectClass =
  "h-9 rounded-xl border border-line bg-surface px-2.5 text-sm font-medium text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function BulkBar({
  selected,
  setSelected,
  pageIds,
  types,
  platforms,
  users,
}: {
  selected: ReadonlySet<string>;
  setSelected: (next: ReadonlySet<string>) => void;
  pageIds: string[];
  types: Option[];
  platforms: Option[];
  users: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState<{ id: string; reason: string }[]>([]);

  const count = selected.size;
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const overLimit = count > MAX_BULK_IDS;

  function apply(field: string, value: string) {
    if (!value || count === 0) return;
    setMessage(null);
    setFailures([]);
    startTransition(async () => {
      const result = await bulkUpdateBugsAction([...selected], { [field]: value });
      if (result.error) {
        setMessage(result.error);
        setFailures(result.skipped ?? []);
        return;
      }
      setSelected(new Set());
      setFailures(result.skipped ?? []);
      setMessage(
        `Updated ${result.updated} issue${result.updated === 1 ? "" : "s"}.`,
      );
      // The rows on screen are server-rendered, so they only show the new
      // values once the page is refetched.
      router.refresh();
    });
  }

  // After a successful apply the selection clears, but the result still has
  // something to say — a count, and any issues that could not be changed.
  // Hiding the whole bar at count === 0 swallowed both.
  if (count === 0) {
    if (!message && failures.length === 0) {
      return <p className="sr-only" role="status" aria-live="polite" />;
    }
    return (
      <div
        role="region"
        aria-label="Bulk actions result"
        className="sticky bottom-3 z-30 mt-3 rounded-[20px] border border-line bg-surface p-4 shadow-pop"
      >
        <p className="text-sm text-ink-2 empty:hidden" role="status" aria-live="polite">
          {message}
        </p>
        <Failures items={failures} />
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setFailures([]);
          }}
          className="mt-1 rounded-md text-xs font-bold text-muted underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-3 z-30 mt-3 rounded-[20px] border border-line bg-surface p-4 shadow-pop"
    >
      <div className="flex flex-wrap items-center gap-2">
        <strong className="text-sm font-bold text-ink">
          {count} selected
        </strong>

        <button
          type="button"
          onClick={() =>
            setSelected(
              allOnPage
                ? new Set([...selected].filter((id) => !pageIds.includes(id)))
                : new Set([...selected, ...pageIds]),
            )
          }
          className="rounded-md px-2 py-1 text-sm font-bold text-accent underline hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {allOnPage ? "Clear this page" : "Select all on this page"}
        </button>
        <button
          type="button"
          onClick={() => {
            setSelected(new Set());
            setMessage(null);
            setFailures([]);
          }}
          className="rounded-md px-2 py-1 text-sm font-semibold text-muted underline hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Clear selection
        </button>

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Field label="Status" disabled={pending || overLimit} onPick={(v) => apply("status", v)}>
            {statuses.map((s) => (
              <option key={s} value={s}>{statusLabel[s]}</option>
            ))}
          </Field>
          <Field label="Severity" disabled={pending || overLimit} onPick={(v) => apply("severity", v)}>
            {severities.map((s) => (
              <option key={s} value={s}>{severityLabel[s]}</option>
            ))}
          </Field>
          <Field label="Type" disabled={pending || overLimit} onPick={(v) => apply("typeId", v)}>
            {types.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Field>
          <Field label="Platform" disabled={pending || overLimit} onPick={(v) => apply("categoryId", v)}>
            {platforms.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Field>
          <Field label="Assignee" disabled={pending || overLimit} onPick={(v) => apply("assigneeId", v)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Field>
        </span>
      </div>

      {/*
        Selection is per page and is not carried across paging or filtering,
        which is easy to assume otherwise — so it is stated rather than left
        to be discovered.
      */}
      <p className="mt-2 text-xs text-muted">
        {overLimit
          ? `Select at most ${MAX_BULK_IDS} issues at a time.`
          : `Applies to the ${count} selected ${count === 1 ? "issue" : "issues"}. Changing page or filters clears the selection.`}
      </p>

      <p
        className="mt-1 text-sm text-ink-2 empty:hidden"
        role="status"
        aria-live="polite"
      >
        {message}
      </p>

      <Failures items={failures} />
    </div>
  );
}

function Failures({ items }: { items: { id: string; reason: string }[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-xs text-warn-fg">
      {items.map((failure) => (
        <li key={failure.id}>
          <span className="font-mono">{failure.id}</span>: {failure.reason}
        </li>
      ))}
    </ul>
  );
}

function Field({
  label,
  children,
  onPick,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onPick: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        aria-label={`Set ${label.toLowerCase()} for the selected issues`}
        className={selectClass}
        disabled={disabled}
        value=""
        onChange={(event) => {
          const value = event.target.value;
          event.target.value = "";
          onPick(value);
        }}
      >
        <option value="">{label}…</option>
        {children}
      </select>
    </label>
  );
}
