"use client";

import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { severities, statuses } from "@/lib/validations/bug";
import { severityLabel, statusLabel } from "@/lib/labels";
import {
  BUG_SORT_OPTIONS,
  bugSortLabels,
  parseBugSort,
} from "@/lib/bugs-sort";
import {
  TAGS_PARAM,
  parseTagFilter,
  serializeTags,
  suggestTags,
} from "@/lib/tag-filter";
import {
  MINE_FILTER_OPTIONS,
  mineFilterLabels,
  parseMineFilter,
} from "@/lib/mine-filter";
import {
  PLATFORM_NONE,
  PLATFORM_PARAM,
  parsePlatformFilter,
  platformChoices,
  type PlatformOption,
} from "@/lib/platform-filter";

type TagType = { id: string; name: string; isActive?: boolean };

/** URL params owned by the filter bar. `page` is paging, not a filter. */
const FILTER_PARAMS = [
  "q",
  TAGS_PARAM,
  "mine",
  "status",
  "severity",
  PLATFORM_PARAM,
  "sort",
];

export function BugFilters({
  tagTypes = [],
  platforms = [],
}: {
  tagTypes?: TagType[];
  platforms?: PlatformOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const listId = useId();

  function updateMany(changes: Record<string, string>) {
    // Nothing changed: don't navigate (and don't reset the page, #132).
    if (Object.entries(changes).every(([key, value]) => (params.get(key) ?? "") === value)) {
      return;
    }
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `/bugs?${qs}` : "/bugs");
  }

  function update(key: string, value: string) {
    updateMany({ [key]: value });
  }

  // Tag (issue type) filter from the search box (#102).
  const selectedTags = parseTagFilter(params.get(TAGS_PARAM), tagTypes);
  const selectedNames = selectedTags.map((t) => t.name);
  const currentQuery = params.get("q") ?? "";
  const [text, setText] = useState(currentQuery);
  // Follow the URL when it changes from outside (Back, a link), adjusting
  // state during render rather than in an effect.
  const [lastQuery, setLastQuery] = useState(currentQuery);
  if (currentQuery !== lastQuery) {
    setLastQuery(currentQuery);
    setText(currentQuery);
  }
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Only active types are suggested; inactive ones still work in a shared link.
  const suggestions = open
    ? suggestTags(tagTypes.filter((t) => t.isActive !== false), text, selectedNames)
    : [];

  function addTag(name: string) {
    // The typed text was only for finding the tag, so put the real search back.
    setText(currentQuery);
    setOpen(false);
    setActive(-1);
    updateMany({ [TAGS_PARAM]: serializeTags([...selectedNames, name]) });
  }

  function removeTag(name: string) {
    update(TAGS_PARAM, serializeTags(selectedNames.filter((n) => n !== name)));
  }

  /** Real link for each chip, so removing a tag also works before hydration. */
  function tagHref(name: string) {
    const next = new URLSearchParams(params.toString());
    const rest = serializeTags(selectedNames.filter((n) => n !== name));
    if (rest) next.set(TAGS_PARAM, rest);
    else next.delete(TAGS_PARAM);
    next.delete("page");
    const qs = next.toString();
    return qs ? `/bugs?${qs}` : "/bugs";
  }

  const currentSort = parseBugSort(params.get("sort"));
  const currentPlatform =
    parsePlatformFilter(params.get(PLATFORM_PARAM), platforms) ?? "";
  const platformOptions = platformChoices(platforms, currentPlatform || null);
  const currentMine = parseMineFilter(params.get("mine")) ?? "";

  // Only worth offering when there is something to clear (#336).
  const hasActiveFilters = FILTER_PARAMS.some((key) => (params.get(key) ?? "") !== "");

  function clearAllFilters() {
    // Empty the box straight away: until the navigation lands, the local draft
    // would otherwise keep showing the text that was just cleared.
    setText("");
    setOpen(false);
    setActive(-1);
    router.push("/bugs");
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
      <div className="col-span-2 min-w-0 sm:min-w-[200px] sm:flex-1">
        <label htmlFor="q" className="mb-1 block text-xs font-medium text-slate-600">
          Search
        </label>
        <div className="relative">
          <input
            id="q"
            name="q"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={suggestions.length > 0}
            aria-controls={listId}
            aria-activedescendant={active >= 0 && suggestions[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            value={text}
            placeholder="Search, or type a tag like Design"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" && suggestions.length > 0) {
                event.preventDefault();
                setActive((i) => (i + 1) % suggestions.length);
              } else if (event.key === "ArrowUp" && suggestions.length > 0) {
                event.preventDefault();
                setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
              } else if (event.key === "Escape") {
                setOpen(false);
                setActive(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                const picked = active >= 0 ? suggestions[active] : undefined;
                if (picked) addTag(picked.name);
                else update("q", text.trim());
              } else if (event.key === "Backspace" && text === "" && selectedNames.length > 0) {
                removeTag(selectedNames[selectedNames.length - 1]);
              }
            }}
            onBlur={() => {
              setOpen(false);
              setActive(-1);
              update("q", text.trim());
            }}
          />
          {suggestions.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Filter by tag"
              className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
            >
              {suggestions.map((type, index) => (
                <li
                  key={type.id}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => addTag(type.name)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${
                    index === active ? "bg-teal-50 text-teal-900" : "text-slate-800"
                  }`}
                >
                  <span className="font-medium">{type.name}</span>
                  <span className="text-xs text-slate-500">Filter by tag</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {selectedTags.length > 0 ? (
          <ul className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Tag filters">
            {selectedTags.map((type) => (
              <li key={type.id}>
                <a
                  href={tagHref(type.name)}
                  onClick={(event) => {
                    event.preventDefault();
                    removeTag(type.name);
                  }}
                  aria-label={`Remove tag ${type.name}`}
                  className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 py-0.5 pl-2.5 pr-1.5 text-xs font-medium text-teal-900 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  {type.name}
                  <span aria-hidden="true" className="text-teal-700">×</span>
                </a>
              </li>
            ))}
            {selectedTags.length > 1 ? (
              <li>
                <button
                  type="button"
                  onClick={() => update(TAGS_PARAM, "")}
                  className="px-1 text-xs text-slate-500 hover:text-slate-800 hover:underline"
                >
                  Clear tags
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      <div className="w-full sm:w-auto">
        <label
          htmlFor="mine"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Show
        </label>
        <select
          id="mine"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:w-auto"
          value={currentMine}
          onChange={(event) => update("mine", event.target.value)}
        >
          <option value="">All issues</option>
          {MINE_FILTER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {mineFilterLabels[option]}
            </option>
          ))}
        </select>
      </div>
      <div className="w-full sm:w-auto">
        <label
          htmlFor="status"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Status
        </label>
        <select
          id="status"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:w-auto"
          value={params.get("status") ?? ""}
          onChange={(event) => update("status", event.target.value)}
        >
          <option value="">All</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {statusLabel[status]}
            </option>
          ))}
        </select>
      </div>
      <div className="w-full sm:w-auto">
        <label
          htmlFor="severity"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Severity
        </label>
        <select
          id="severity"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:w-auto"
          value={params.get("severity") ?? ""}
          onChange={(event) => update("severity", event.target.value)}
        >
          <option value="">All</option>
          {severities.map((severity) => (
            <option key={severity} value={severity}>
              {severityLabel[severity]}
            </option>
          ))}
        </select>
      </div>
      {platformOptions.length > 0 ? (
        <div className="w-full sm:w-auto">
          <label
            htmlFor="platform"
            className="mb-1 block text-xs font-medium text-slate-600"
          >
            Platform
          </label>
          <select
            id="platform"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:w-auto"
            value={currentPlatform}
            onChange={(event) => update(PLATFORM_PARAM, event.target.value)}
          >
            <option value="">All</option>
            {platformOptions.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
            {/* Unset is a real state, and the only way to find those issues. */}
            <option value={PLATFORM_NONE}>No platform</option>
          </select>
        </div>
      ) : null}
      <div className="w-full sm:w-auto">
        <label
          htmlFor="sort"
          className="mb-1 block text-xs font-medium text-slate-600"
        >
          Sort
        </label>
        <select
          id="sort"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:w-auto"
          value={currentSort}
          onChange={(event) => update("sort", event.target.value)}
        >
          {BUG_SORT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {bugSortLabels[option]}
            </option>
          ))}
        </select>
      </div>
      {hasActiveFilters ? (
        <div className="col-span-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={clearAllFilters}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 sm:w-auto"
          >
            Clear all filters
          </button>
        </div>
      ) : null}
    </div>
  );
}
