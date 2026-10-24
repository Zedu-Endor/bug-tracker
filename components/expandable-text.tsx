"use client";

import { useState, useId, useEffect, useRef } from "react";

type ExpandableTextProps = {
  /** The full text content to display */
  children: React.ReactNode;
  /** Maximum number of lines to show when collapsed */
  maxLines?: number;
  /** Text for the expand button */
  expandText?: string;
  /** Text for the collapse button */
  collapseText?: string;
  /** Additional CSS classes */
  className?: string;
  initiallyExpanded?: boolean;
};

export function ExpandableText({
  children,
  maxLines = 3,
  expandText = "View more",
  collapseText = "View less",
  className,
  initiallyExpanded = false,
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [isTruncated, setIsTruncated] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const detailsId = useId();

  // Check if content overflows the max lines. Re-measure when the content,
  // width, font or expansion state changes: the first measurement can run
  // before webfonts settle, which made the same description render expanded
  // on one load and collapsed on the next.
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const measure = () => {
      const style = window.getComputedStyle(element);
      const lineHeight = parseFloat(style.lineHeight);
      if (!Number.isFinite(lineHeight)) return;
      const maxHeight = lineHeight * maxLines;
      setIsTruncated(element.scrollHeight > maxHeight + 1);
    };

    measure();
    let cancelled = false;
    const safeMeasure = () => {
      if (!cancelled) measure();
    };
    const observer = new ResizeObserver(safeMeasure);
    observer.observe(element);
    window.addEventListener("resize", safeMeasure);
    void document.fonts?.ready.then(safeMeasure);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", safeMeasure);
    };
  }, [maxLines, children, isTruncated]);

  if (!isTruncated) {
    return (
      <div ref={contentRef} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div className={className}>
      <div
        ref={contentRef}
        id={detailsId}
        className={expanded ? "" : "line-clamp-3"}
        style={{ WebkitLineClamp: expanded ? "unset" : maxLines }}
      >
        {children}
      </div>
      <button
        type="button"
        className="mt-2 text-xs font-medium text-teal-700 hover:underline"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? collapseText : expandText}
      </button>
    </div>
  );
}