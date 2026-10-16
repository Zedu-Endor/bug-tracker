export type VoteChange = {
  nextVote: 1 | -1 | 0;
  countDelta: number;
};

/**
 * Shown when a concurrent vote on the same issue wins the race, so this
 * request is discarded rather than partially applied. The client can retry.
 */
export const VOTE_CONFLICT_MESSAGE =
  "Someone voted on this issue at the same time. Please try again.";

/**
 * How many times a vote write is retried before giving up.
 *
 * Every vote touches the same Bug row, so genuinely simultaneous votes on one
 * issue conflict under SERIALIZABLE. A short retry clears the common case
 * without ever needing to surface the conflict message.
 */
export const VOTE_WRITE_ATTEMPTS = 3;

/** Validates vote direction: only 1 (like) and -1 (dislike) are supported; out-of-range or malformed values are rejected. */
export function isValidVoteDirection(direction: unknown): direction is 1 | -1 {
  return direction === 1 || direction === -1;
}

/**
 * Pure helper for calculating score changes and next vote state
 * when upvoting (direction = 1) or downvoting (direction = -1).
 */
export function calculateVoteChange(
  currentVote: number | null | undefined,
  direction: 1 | -1,
): VoteChange {
  const current = currentVote === 1 ? 1 : currentVote === -1 ? -1 : 0;

  if (current === direction) {
    // Toggle off existing vote
    return {
      nextVote: 0,
      countDelta: -direction,
    };
  }

  if (current === 0) {
    // Fresh vote from neutral
    return {
      nextVote: direction,
      countDelta: direction,
    };
  }

  // Switching vote (+1 to -1 or -1 to +1)
  return {
    nextVote: direction,
    countDelta: direction * 2,
  };
}
