export type VoteChange = {
  nextVote: 1 | -1 | 0;
  countDelta: number;
};

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

/**
 * Calculates authoritative voteCount from like and dislike counts,
 * guaranteeing Bug.voteCount precisely matches SUM(Vote.value).
 */
export function reconcileVoteCount(
  likeCount: number,
  dislikeCount: number,
): number {
  return likeCount - dislikeCount;
}

