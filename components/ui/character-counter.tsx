/**
 * Live "current/max" counter for length-limited fields.
 *
 * Kicks in as the value nears the limit so people see the constraint before
 * the server rejects their submission:
 * - default: slate (matches the rest of the form's helper text)
 * - within the last tenth of the limit: amber
 * - at the limit: red
 *
 * `aria-live="polite"` announces the count as it changes without stealing
 * focus or interrupting typing.
 */
export const NEAR_LIMIT_RATIO = 0.9;

export type CharacterCountTone = "normal" | "warn" | "limit";

export function characterCountTone(
  length: number,
  max: number,
): CharacterCountTone {
  if (length >= max) return "limit";
  if (length >= Math.ceil(max * NEAR_LIMIT_RATIO)) return "warn";
  return "normal";
}

const TONE_CLASS: Record<CharacterCountTone, string> = {
  normal: "text-slate-500",
  // amber-700 keeps >=4.5:1 contrast on white (amber-600 falls short).
  warn: "text-amber-700",
  limit: "text-red-600",
};

export function CharacterCounter({
  length,
  max,
  className = "",
}: {
  length: number;
  max: number;
  className?: string;
}) {
  const tone = characterCountTone(length, max);
  return (
    <p
      aria-live="polite"
      className={`text-xs tabular-nums ${TONE_CLASS[tone]} ${className}`.trim()}
    >
      {length}/{max}
    </p>
  );
}
