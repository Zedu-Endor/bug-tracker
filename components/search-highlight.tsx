import type { Segment, Snippet } from "@/lib/search-snippet";

// amber-200 behind slate-900 is ~13:1, well past AA for small text.
const MARK = "rounded-sm bg-amber-200 px-0.5 text-slate-900";

export function Highlighted({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, i) =>
        segment.match ? (
          <mark key={i} className={MARK}>
            {segment.text}
          </mark>
        ) : (
          <span key={i}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/** One line of matching description text under a search result (#301). */
export function SearchSnippet({ snippet }: { snippet: Snippet }) {
  return (
    <p className="line-clamp-2 text-sm text-muted break-words" data-testid="search-snippet">
      <span className="sr-only">Matched in description: </span>
      {snippet.before ? "…" : null}
      <Highlighted segments={snippet.segments} />
      {snippet.after ? "…" : null}
    </p>
  );
}
